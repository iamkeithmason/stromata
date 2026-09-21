/**
 * generate-review-drafts.mjs — pre-generation for the /admin/review queue.
 *
 * The review queue is meant to be read and tapped through on a phone in spare
 * minutes. Anything that needs an API call has to be done BEFORE Keith opens
 * it, or every card becomes a wait. This script fills the three draft fields
 * the queue reads:
 *
 *   texts.note_draft            — the editorial introduction, where one is
 *                                 missing (4 drafts at time of writing). Uses
 *                                 the shared critic loop, so these are held to
 *                                 the same bar as every other note.
 *   texts.summary_draft         — the ~110–140 character summary, generated
 *                                 from title + note_draft rather than the body.
 *                                 A note_draft is already ~800 characters of
 *                                 distilled editorial prose about this exact
 *                                 text; summarising that instead of a
 *                                 30,000-word body costs a fraction and reads
 *                                 no worse. This is why note_drafts are filled
 *                                 first below — the summary depends on them.
 *   collections.description_draft — the collection blurb, ~800 characters,
 *                                 written from the collection's note_drafts.
 *
 * Nothing here publishes, and nothing here writes a live field: every write
 * goes to a *_draft column, which is what makes the script safe to re-run and
 * safe to run ahead of review.
 *
 * Usage:
 *   node scripts/generate-review-drafts.mjs                          # everything missing
 *   node scripts/generate-review-drafts.mjs --collection <slug>      # one collection
 *   node scripts/generate-review-drafts.mjs --standalone             # texts with no collection
 *   node scripts/generate-review-drafts.mjs --dry-run                # print the plan, call nothing
 *   node scripts/generate-review-drafts.mjs --force                  # regenerate drafts that exist
 *   node scripts/generate-review-drafts.mjs --limit=10               # cap the work
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { NOTE_MODEL, generateNoteWithCritic } from './lib/note-prompt.mjs';
import {
  SUMMARY_MODEL,
  REVIEW_SUMMARY_GUIDANCE,
  generateSummary,
} from './lib/summary-prompt.mjs';
import {
  PRICES,
  costReport,
  selectDescriptionTargets,
  selectNoteTargets,
  selectSummaryTargets,
  summarySourceFor,
} from './lib/review-drafts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

// ── Flags ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const flagValue = (name) => {
  const hit = args.find((a) => a.startsWith(`${name}=`));
  if (hit) return hit.slice(name.length + 1);
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : null;
};

const MODE = {
  collection: flagValue('--collection'),
  standalone: hasFlag('--standalone'),
  dryRun: hasFlag('--dry-run'),
  force: hasFlag('--force'),
  limit: flagValue('--limit') ? parseInt(flagValue('--limit'), 10) : null,
};

// ── Cost accounting ──────────────────────────────────────────────────────────
// Prices and the report live in lib/review-drafts.mjs, where they are unit
// tested — a cost report that silently reads $0.00 because a model id drifted
// is worse than no report at all.

const spend = new Map(); // model → { inputTokens, outputTokens }
function record(model, usage) {
  if (!usage) return;
  const bucket = spend.get(model) ?? { inputTokens: 0, outputTokens: 0 };
  bucket.inputTokens += usage.inputTokens ?? 0;
  bucket.outputTokens += usage.outputTokens ?? 0;
  spend.set(model, bucket);
}

function reportSpend() {
  if (spend.size === 0) {
    console.log('\nNo API calls made.');
    return;
  }
  const { lines, total, unpriced } = costReport(spend, PRICES);
  console.log('\n── Tokens and cost ─────────────────────────────────────────');
  for (const line of lines) console.log(`  ${line}`);
  console.log(
    `  TOTAL: $${total.toFixed(4)}` +
    (unpriced.length ? ` (excluding ${unpriced.join(', ')} — no price on file)` : '')
  );
}

// ── Clients ──────────────────────────────────────────────────────────────────
function requireEnv(name) {
  if (!process.env[name]) {
    console.error(`Missing ${name}. Set it in .env.local before running.`);
    process.exit(1);
  }
  return process.env[name];
}

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
);
// The API key is only needed for a real run; a dry run should work without it.
const anthropic = MODE.dryRun
  ? null
  : new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });

// ── The collection description prompt ────────────────────────────────────────
// Deliberately local rather than in scripts/lib: this is the only caller. The
// lesson the shared modules encode is that *duplicated* prompts drift — a
// single-caller prompt belongs with its caller until a second one appears.
const DESCRIPTION_PROMPT = `You are writing the description for a collection on The Stromata, a curated library of out-of-print Christian theological texts. A collection gathers the chapters or books of a single work.

You will be given the collection's title, its author, and the editorial notes written for several of its individual chapters. Write the description of the collection as a whole.

- About 800 characters. Three or four sentences.
- Describe the WORK, not the chapters individually, and not the library. What is it, what occasioned it, what does it argue or do, what is it like to read?
- Open with something concrete and specific to this work. Do not open with the title, the author's name, or "This collection".
- Do not list the chapters. Do not say how many there are.
- No marketing register, no evaluation of importance, no instructions to the reader about how to read it.
- Do not end with "Expect…", "Read it…", or an "X rather than Y" contrast.

Return only the description, with no preamble. End on a complete sentence.`;

async function generateDescription({ title, author, notes }) {
  const userMessage = [
    `Collection: ${title}`,
    `Author: ${author}`,
    '',
    'Editorial notes from chapters of this work:',
    ...notes.slice(0, 8).map((n, i) => `  (${i + 1}) ${n}`),
  ].join('\n');

  const message = await anthropic.messages.create({
    model: NOTE_MODEL,
    max_tokens: 700,
    system: DESCRIPTION_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });
  record(NOTE_MODEL, {
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
  });
  return (message.content?.[0]?.text ?? '').trim();
}

// ── Target selection ─────────────────────────────────────────────────────────

async function loadDraftTexts() {
  let query = supabase
    .from('texts')
    .select(
      'id, title, slug, body, note_draft, summary, summary_draft, author_id, collection_id, ' +
      'author:authors(name), collection:collections(slug)'
    )
    .eq('published', false)
    .order('collection_order', { nullsFirst: false });

  const { data, error } = await query;
  if (error) {
    console.error('Failed to load drafts:', error.message);
    process.exit(1);
  }

  let rows = data ?? [];
  if (MODE.collection) {
    rows = rows.filter((t) => t.collection?.slug === MODE.collection);
    if (rows.length === 0) {
      console.error(`No unpublished texts found in collection "${MODE.collection}".`);
      process.exit(1);
    }
  } else if (MODE.standalone) {
    rows = rows.filter((t) => !t.collection_id);
  }
  return rows;
}

// ── Step 1: note_draft ───────────────────────────────────────────────────────

async function fillNoteDrafts(texts, siblingsByAuthor) {
  const targets = selectNoteTargets(texts, { force: MODE.force });
  if (targets.length === 0) {
    console.log('Introductions: all present.\n');
    return 0;
  }

  const slice = MODE.limit ? targets.slice(0, MODE.limit) : targets;
  console.log(`Introductions: ${slice.length} to generate (model: ${NOTE_MODEL}).`);

  let done = 0;
  for (let i = 0; i < slice.length; i++) {
    const text = slice[i];
    const authorName = text.author?.name ?? 'Unknown';
    console.log(`  [${i + 1}/${slice.length}] ${text.title}`);

    if (MODE.dryRun) { done++; continue; }

    const siblingNotes = (siblingsByAuthor.get(text.author_id) ?? [])
      .filter((s) => s.id !== text.id)
      .map((s) => s.note)
      .filter(Boolean);

    let result;
    try {
      result = await generateNoteWithCritic({
        anthropic, title: text.title, author: authorName,
        body: text.body ?? '', siblingNotes,
        log: (msg) => console.log(`  ${msg}`),
      });
    } catch (err) {
      console.error(`    ✗ API error: ${err.message}`);
      continue;
    }
    record(NOTE_MODEL, result.usage);

    if (!result.note) {
      console.error('    ✗ no usable note produced; leaving unchanged');
      continue;
    }

    const { error } = await supabase
      .from('texts')
      .update({ note_draft: result.note })
      .eq('id', text.id);
    if (error) {
      console.error(`    ✗ write error: ${error.message}`);
      continue;
    }

    // Keep the in-memory row and the sibling map current: the summary step
    // below reads note_draft, and later notes by this author steer away from it.
    text.note_draft = result.note;
    const bucket = siblingsByAuthor.get(text.author_id) ?? [];
    const existing = bucket.find((s) => s.id === text.id);
    if (existing) existing.note = result.note;
    else bucket.push({ id: text.id, note: result.note });
    siblingsByAuthor.set(text.author_id, bucket);

    console.log(`    ✓ saved (${result.note.length} chars, score ${result.score ?? 'n/a'})`);
    done++;
  }
  console.log('');
  return done;
}

// ── Step 2: summary_draft ────────────────────────────────────────────────────

async function fillSummaryDrafts(texts) {
  // A text that already has a live `summary` needs no draft — the queue falls
  // back to it. `--force` regenerates regardless. (Selection is unit tested in
  // lib/review-drafts.test.mjs.)
  const targets = selectSummaryTargets(texts, { force: MODE.force });
  if (targets.length === 0) {
    console.log('Summaries: all present.\n');
    return 0;
  }

  const slice = MODE.limit ? targets.slice(0, MODE.limit) : targets;
  console.log(`Summaries: ${slice.length} to generate (model: ${SUMMARY_MODEL}).`);

  let done = 0;
  for (let i = 0; i < slice.length; i++) {
    const text = slice[i];
    const authorName = text.author?.name ?? 'Unknown';

    // Prefer the note_draft; fall back to the body only when there is still no
    // note (generation failed above, or --limit cut it off).
    const { source, from } = summarySourceFor(text);
    if (!source) {
      console.warn(`  [${i + 1}/${slice.length}] ${text.title} — no note_draft and no body; skipped`);
      continue;
    }

    if (MODE.dryRun) {
      console.log(`  [${i + 1}/${slice.length}] ${text.title} — from ${from}`);
      done++;
      continue;
    }

    let summary;
    try {
      const result = await generateSummary({
        anthropic, title: text.title, author: authorName, source,
        extraGuidance: REVIEW_SUMMARY_GUIDANCE,
      });
      summary = result.summary;
      record(SUMMARY_MODEL, result);
    } catch (err) {
      console.error(`  [${i + 1}/${slice.length}] ${text.title} — ✗ API error: ${err.message}`);
      continue;
    }

    if (!summary) {
      console.error(`  [${i + 1}/${slice.length}] ${text.title} — ✗ no usable summary`);
      continue;
    }

    const { error } = await supabase
      .from('texts')
      .update({ summary_draft: summary })
      .eq('id', text.id);
    if (error) {
      console.error(`  [${i + 1}/${slice.length}] ${text.title} — ✗ write error: ${error.message}`);
      continue;
    }

    text.summary_draft = summary;
    console.log(`  [${i + 1}/${slice.length}] ${text.title} — ✓ ${summary.length} chars`);
    done++;
  }
  console.log('');
  return done;
}

// ── Step 3: collections.description_draft ────────────────────────────────────

// Who a collection is by is derived from its texts — `collections.author_id` is
// only a manual override and is null for everything the pipeline creates, so
// reading it alone would hand the description prompt "Unknown" for most
// collections. Mirrors lib/collections/author.ts, which is the TypeScript copy
// the site renders from; this script runs under plain node and can't import it.
function collectionAuthorName(collection, texts) {
  const override = [collection.author].flat().filter(Boolean)[0];
  if (override?.name) return override.name;

  const names = [];
  for (const t of texts) {
    const name = [t.author].flat().filter(Boolean)[0]?.name;
    if (name && !names.includes(name)) names.push(name);
  }
  if (names.length === 0) return 'Unknown';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

async function fillCollectionDescriptions(texts) {
  const collectionIds = [...new Set(texts.map((t) => t.collection_id).filter(Boolean))];
  if (collectionIds.length === 0) {
    console.log('Collection descriptions: no collections in scope.\n');
    return 0;
  }

  const { data: collections, error } = await supabase
    .from('collections')
    .select('id, title, slug, description, description_draft, author:authors(name)')
    .in('id', collectionIds);
  if (error) {
    console.error('Failed to load collections:', error.message);
    return 0;
  }

  const targets = selectDescriptionTargets(collections ?? [], { force: MODE.force });
  if (targets.length === 0) {
    console.log('Collection descriptions: all present.\n');
    return 0;
  }

  console.log(`Collection descriptions: ${targets.length} to generate (model: ${NOTE_MODEL}).`);

  let done = 0;
  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    const inCollection = texts.filter((t) => t.collection_id === c.id);
    const notes = inCollection.filter((t) => t.note_draft).map((t) => t.note_draft);

    if (notes.length === 0) {
      console.warn(`  [${i + 1}/${targets.length}] ${c.title} — no note drafts to write from; skipped`);
      continue;
    }

    if (MODE.dryRun) {
      console.log(`  [${i + 1}/${targets.length}] ${c.title} — from ${notes.length} note(s)`);
      done++;
      continue;
    }

    let description;
    try {
      description = await generateDescription({
        title: c.title,
        author: collectionAuthorName(c, inCollection),
        notes,
      });
    } catch (err) {
      console.error(`  [${i + 1}/${targets.length}] ${c.title} — ✗ API error: ${err.message}`);
      continue;
    }

    if (!description) {
      console.error(`  [${i + 1}/${targets.length}] ${c.title} — ✗ no usable description`);
      continue;
    }

    const { error: writeError } = await supabase
      .from('collections')
      .update({ description_draft: description })
      .eq('id', c.id);
    if (writeError) {
      console.error(`  [${i + 1}/${targets.length}] ${c.title} — ✗ write error: ${writeError.message}`);
      continue;
    }

    console.log(`  [${i + 1}/${targets.length}] ${c.title} — ✓ ${description.length} chars`);
    done++;
  }
  console.log('');
  return done;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const scope = MODE.collection
    ? `collection "${MODE.collection}"`
    : MODE.standalone
      ? 'standalone drafts'
      : 'all drafts';
  console.log(
    `Pre-generating review drafts for ${scope}` +
    `${MODE.dryRun ? ' (dry run — no API calls, no writes)' : ''}` +
    `${MODE.force ? ' (force — regenerating existing drafts)' : ''}\n`
  );

  const texts = await loadDraftTexts();
  console.log(`${texts.length} unpublished text(s) in scope.\n`);
  if (texts.length === 0) return;

  // Sibling notes per author, so the critic loop can steer a new note away from
  // the cluster it belongs to. Built from the whole corpus, not just this scope.
  const { data: allNoted } = await supabase
    .from('texts')
    .select('id, author_id, note_draft')
    .not('note_draft', 'is', null);
  const siblingsByAuthor = new Map();
  for (const t of allNoted ?? []) {
    if (!t.author_id) continue;
    if (!siblingsByAuthor.has(t.author_id)) siblingsByAuthor.set(t.author_id, []);
    siblingsByAuthor.get(t.author_id).push({ id: t.id, note: t.note_draft });
  }

  // Order matters: summaries are written from note_drafts.
  const notes = await fillNoteDrafts(texts, siblingsByAuthor);
  const summaries = await fillSummaryDrafts(texts);
  const descriptions = await fillCollectionDescriptions(texts);

  console.log('── Summary ─────────────────────────────────────────────────');
  const verb = MODE.dryRun ? 'would generate' : 'generated';
  console.log(`  Introductions ${verb}: ${notes}`);
  console.log(`  Summaries ${verb}: ${summaries}`);
  console.log(`  Collection descriptions ${verb}: ${descriptions}`);
  reportSpend();
  if (!MODE.dryRun) console.log('\nReview them at /admin/review.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
