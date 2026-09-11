/**
 * generate-note-drafts.mjs — generate / heal editorial note drafts via Claude.
 *
 * All generation logic (prompt, anti-formula guards, critic loop, truncation
 * guard) lives in scripts/lib/note-prompt.mjs and is shared with the Stage 2
 * ingestion path. This script is the batch driver: it selects which texts to
 * (re)generate, passes each through the critic loop with its sibling notes for
 * de-clustering, and writes the result back. Safe to re-run.
 *
 * Modes:
 *   node scripts/generate-note-drafts.mjs                # fill only missing notes (default)
 *   node scripts/generate-note-drafts.mjs --all          # regenerate every note
 *   node scripts/generate-note-drafts.mjs --truncated    # heal notes cut mid-sentence
 *   node scripts/generate-note-drafts.mjs --slug=foo-bar # one text
 *   node scripts/generate-note-drafts.mjs --limit=10     # cap how many are processed
 *   node scripts/generate-note-drafts.mjs --dry-run      # print what would change, write nothing
 *   node scripts/generate-note-drafts.mjs --no-critic    # skip the critic loop (faster/cheaper)
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import {
  NOTE_MODEL,
  endsOnCompleteSentence,
  generateNoteWithCritic,
} from './lib/note-prompt.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const flagValue = (name) => {
  const hit = args.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
};

const MODE = {
  all: hasFlag('--all'),
  truncated: hasFlag('--truncated'),
  slug: flagValue('--slug'),
  limit: flagValue('--limit') ? parseInt(flagValue('--limit'), 10) : null,
  dryRun: hasFlag('--dry-run'),
  useCritic: !hasFlag('--no-critic'),
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  // Pull every text once: we need the full set both to choose targets and to
  // build each author's sibling-note context for de-clustering.
  const { data: allTexts, error: fetchError } = await supabase
    .from('texts')
    .select('id, title, slug, body, note_draft, author_id, author:authors(name)');

  if (fetchError) {
    console.error('Failed to fetch texts:', fetchError.message);
    process.exit(1);
  }

  // Decide which texts to (re)generate.
  let targets = allTexts.filter((t) => {
    if (MODE.slug) return t.slug === MODE.slug;
    if (MODE.all) return true;
    if (MODE.truncated) return t.note_draft && !endsOnCompleteSentence(t.note_draft);
    return !t.note_draft; // default: only missing
  });

  if (MODE.limit) targets = targets.slice(0, MODE.limit);

  const total = targets.length;
  if (total === 0) {
    console.log('No texts match the selected mode. Nothing to do.');
    return;
  }

  // Sibling map: author_id → existing note_drafts (excluding the target itself,
  // filled in per-iteration). Built from the current DB state.
  const notesByAuthor = new Map();
  for (const t of allTexts) {
    if (!t.author_id || !t.note_draft) continue;
    if (!notesByAuthor.has(t.author_id)) notesByAuthor.set(t.author_id, []);
    notesByAuthor.get(t.author_id).push({ id: t.id, note: t.note_draft });
  }

  console.log(
    `Mode: ${MODE.all ? 'all' : MODE.truncated ? 'truncated' : MODE.slug ? `slug=${MODE.slug}` : 'missing-only'}` +
    `${MODE.dryRun ? ' (dry-run)' : ''}${MODE.useCritic ? '' : ' (no-critic)'} — ${total} text(s)\n`
  );

  let generated = 0;
  for (let i = 0; i < targets.length; i++) {
    const text = targets[i];
    const authorName = text.author?.name ?? 'Unknown';
    console.log(`[${i + 1}/${total}] ${text.title} — ${authorName}`);

    const siblingNotes = (notesByAuthor.get(text.author_id) ?? [])
      .filter((s) => s.id !== text.id)
      .map((s) => s.note);

    let result;
    try {
      result = await generateNoteWithCritic({
        anthropic,
        title: text.title,
        author: authorName,
        body: text.body ?? '',
        siblingNotes,
        useCritic: MODE.useCritic,
        log: (msg) => console.log(msg),
      });
    } catch (err) {
      console.error(`  ✗ API error: ${err.message}`);
      continue;
    }

    if (!result.note) {
      console.error('  ✗ No usable note produced; leaving unchanged');
      continue;
    }

    console.log(`  → ${result.note}`);
    console.log(`    (attempts ${result.attempts}, score ${result.score ?? 'n/a'})`);

    if (MODE.dryRun) { generated++; continue; }

    const { error: writeError } = await supabase
      .from('texts')
      .update({ note_draft: result.note })
      .eq('id', text.id);

    if (writeError) {
      console.error(`  ✗ Write error: ${writeError.message}`);
      continue;
    }

    // Keep the sibling map current so later texts by the same author see this
    // fresh note and steer away from it too.
    const bucket = notesByAuthor.get(text.author_id) ?? [];
    const existing = bucket.find((s) => s.id === text.id);
    if (existing) existing.note = result.note;
    else bucket.push({ id: text.id, note: result.note });
    notesByAuthor.set(text.author_id, bucket);

    console.log('  ✓ Saved');
    generated++;
  }

  console.log(`\nDone. ${generated} note${generated === 1 ? '' : 's'} ${MODE.dryRun ? 'would be written' : 'written'} (model: ${NOTE_MODEL}).`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
