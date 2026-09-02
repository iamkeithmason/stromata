/**
 * rejoin-text-paragraphs.mjs — heal mid-sentence page-break splits in DB texts
 *
 * The same repair pipeline-import.mjs now applies at import time, but run over
 * texts already in the database. Scanned/OCR sources split a sentence into two
 * paragraphs wherever a printed page ended (e.g. `…"Whoso shall` / blank /
 * `break one of the least…`); this rejoins those mid-sentence splits — and only
 * those (see rejoinSpuriousBreaks) — leaving every other aspect of the body's
 * spacing untouched.
 *
 * Dry-run by default; nothing is written without --write. Safe to re-run: a
 * body with no splits is left byte-for-byte unchanged.
 *
 * Usage:
 *   node scripts/rejoin-text-paragraphs.mjs                 # scan every text, preview
 *   node scripts/rejoin-text-paragraphs.mjs --slug=<slug>   # one text by slug
 *   node scripts/rejoin-text-paragraphs.mjs --id=<uuid>     # one text by id
 *   node scripts/rejoin-text-paragraphs.mjs --write         # apply the repairs
 *   node scripts/rejoin-text-paragraphs.mjs --context       # show each healed join
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { rejoinSpuriousBreaks } from './normalise-markdown.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);
const write = args.includes('--write');
const showContext = args.includes('--context');
const slugArg = args.find(a => a.startsWith('--slug='))?.split('=')[1];
const idArg = args.find(a => a.startsWith('--id='))?.split('=')[1];

// For --context: show the words either side of each healed join so the change
// is auditable at a glance. We diff the whitespace runs that were collapsed.
function joinPreviews(before, after) {
  // Every healed split was a "\n\n…" that became a single space. Find the
  // paragraph starts in `before` that no longer begin a paragraph in `after`.
  const previews = [];
  const beforeParas = before.split(/\n{2,}/);
  for (let i = 1; i < beforeParas.length; i++) {
    const tail = beforeParas[i - 1].trim().slice(-40);
    const head = beforeParas[i].trim().slice(0, 40);
    // A join happened here if the two paragraphs are now adjacent (single space).
    if (after.includes(`${beforeParas[i - 1].trim().slice(-20)} ${beforeParas[i].trim().slice(0, 20)}`)) {
      previews.push(`    …${tail} ⏎⏎→ ${head}…`);
    }
  }
  return previews;
}

async function main() {
  let query = supabase.from('texts').select('id, slug, title, body');
  if (idArg) query = query.eq('id', idArg);
  else if (slugArg) query = query.eq('slug', slugArg);

  const { data: texts, error } = await query;
  if (error) throw new Error(`Failed to load texts: ${error.message}`);
  if (!texts || texts.length === 0) {
    console.log('No matching texts found.');
    return;
  }

  console.log(
    `${write ? 'WRITE' : 'DRY RUN (no changes written; pass --write to apply)'} — scanning ${texts.length} text(s).\n`
  );

  let changed = 0;
  let totalJoins = 0;

  for (const text of texts) {
    if (!text.body) continue;
    const { output, joined } = rejoinSpuriousBreaks(text.body);
    if (joined === 0) continue;

    changed++;
    totalJoins += joined;
    console.log(`✎ ${text.slug} (${text.id}) — ${joined} split(s) to rejoin`);
    if (showContext) {
      for (const line of joinPreviews(text.body, output)) console.log(line);
    }

    if (write) {
      const { error: updateError } = await supabase.from('texts').update({ body: output }).eq('id', text.id);
      if (updateError) {
        console.warn(`  ! update failed for ${text.slug}: ${updateError.message}`);
        continue;
      }
      console.log('  ↩ written');
    }
  }

  console.log(
    `\nTOTALS: ${changed}/${texts.length} text(s) ${write ? 'updated' : 'would change'}  ·  ${totalJoins} split(s) rejoined.`
  );
  if (!write && changed > 0) console.log('Re-run with --write to apply.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
