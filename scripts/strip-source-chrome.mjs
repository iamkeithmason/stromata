/**
 * strip-source-chrome.mjs — remove source-site chrome from texts already in the DB
 *
 * The same cleaning `pipeline-import.mjs` now applies at import time, run over
 * rows that were imported before it existed. New Advent's A–Z bar, masthead
 * logo, breadcrumb, footer nav and "About this page" source citation; Project
 * Gutenberg's boilerplate. See scripts/lib/source-chrome.mjs for the rules and
 * for why it is safe to run every rule against every body.
 *
 * Dry-run by default; nothing is written without --write. Idempotent: a body
 * with no chrome is left byte-for-byte unchanged, so this is safe to re-run.
 *
 * Advisory findings (a body opening with an H1 that duplicates the title the
 * reader already renders; an image whose path is relative to the source site)
 * are reported and never written. `--drop-leading-h1` opts into removing the
 * duplicated heading, since whether a text wants a body heading is an
 * editorial call, not a mechanical one.
 *
 * `--files` applies the SAME decision to the staged `scripts/ingestion/output`
 * markdown for each text it touches, matched by slug. Without it the two stores
 * drift apart on every heal: the database gets cleaned and the file it was
 * imported from keeps the artefact, so the next person to read the file sees
 * something the site no longer shows. One decision, both stores, one run.
 *
 * Usage:
 *   node scripts/strip-source-chrome.mjs                    # scan every text, preview
 *   node scripts/strip-source-chrome.mjs --slug=<slug>      # one text by slug
 *   node scripts/strip-source-chrome.mjs --id=<uuid>        # one text by id
 *   node scripts/strip-source-chrome.mjs --drafts           # unpublished texts only
 *   node scripts/strip-source-chrome.mjs --drop-leading-h1  # also drop a duplicated title heading
 *   node scripts/strip-source-chrome.mjs --drop-leading-h1 --files   # …and the staged .md too
 *   node scripts/strip-source-chrome.mjs --write            # apply
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { stripChrome } from './lib/source-chrome.mjs';
import { leadingH1Verdict } from './lib/leading-h1.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const args = process.argv.slice(2);
const write = args.includes('--write');
const draftsOnly = args.includes('--drafts');
const dropLeadingHeading = args.includes('--drop-leading-h1');
const alsoFiles = args.includes('--files');
const slug = args.find(a => a.startsWith('--slug='))?.slice('--slug='.length);
const id = args.find(a => a.startsWith('--id='))?.slice('--id='.length);

// ---------------------------------------------------------------------------
// Staged output files — kept in step with the database
// ---------------------------------------------------------------------------

const OUTPUT_DIR = path.join(__dirname, 'ingestion', 'output');

/** The staged markdown for a slug, or null. Mirrors pipeline-import's layout. */
function findOutputFile(slug) {
  const flat = path.join(OUTPUT_DIR, `${slug}.md`);
  if (fs.existsSync(flat)) return flat;
  if (!fs.existsSync(OUTPUT_DIR)) return null;
  const stack = [OUTPUT_DIR];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === `${slug}.md`) return full;
    }
  }
  return null;
}

/**
 * Apply the same transformation to the staged file, leaving its frontmatter
 * alone. Returns what changed, or null if there is no file or nothing to do.
 */
function alignOutputFile(slug, { dropHeading }, write) {
  const file = findOutputFile(slug);
  if (!file) return null;
  const raw = fs.readFileSync(file, 'utf-8');
  const end = raw.startsWith('---') ? raw.indexOf('\n---\n', 3) : -1;
  const head = end === -1 ? '' : raw.slice(0, end + 5);
  const body = end === -1 ? raw : raw.slice(end + 5);

  const { output, removed } = stripChrome(body, { dropLeadingHeading: dropHeading || false });
  if (removed.length === 0) return null;
  if (write) fs.writeFileSync(file, head + (head ? '\n' : '') + output + '\n');
  return { file: path.relative(path.join(__dirname, '..'), file), removed };
}

async function main() {
  let query = supabase.from('texts').select('id, slug, title, published, body');
  if (slug) query = query.eq('slug', slug);
  if (id) query = query.eq('id', id);
  if (draftsOnly) query = query.eq('published', false);

  const { data: texts, error } = await query;
  if (error) {
    console.error(`Query failed: ${error.message}`);
    process.exit(1);
  }
  if (!texts?.length) {
    console.log('No texts matched.');
    return;
  }

  console.log(`${write ? 'Cleaning' : 'Scanning (dry run)'} ${texts.length} text(s)\n`);

  let dirty = 0;
  let written = 0;
  let advised = 0;
  let filesTouched = 0;
  let headingsKept = 0;

  for (const text of texts) {
    // The leading-H1 decision is per text, not per run: it needs the title to
    // compare against, plus the vetoes. Resolve it first, then hand stripChrome
    // the heading to remove (or nothing) so both stores get the same verdict.
    const verdict = dropLeadingHeading ? leadingH1Verdict(text) : { drop: false };
    if (dropLeadingHeading && !verdict.drop && verdict.why) headingsKept++;
    const dropHeading = verdict.drop ? verdict.heading : false;

    const { output, removed, advisories } = stripChrome(text.body || '', {
      dropLeadingHeading: dropHeading,
    });

    if (removed.length > 0) {
      dirty++;
      const state = text.published ? 'PUBLISHED' : 'draft';
      console.log(`${text.slug}  [${state}]`);
      for (const r of removed) {
        console.log(`  - ${r.rule}: ${r.excerpt}`);
      }
      if (verdict.drop) console.log(`    (${verdict.why})`);
      const delta = (text.body?.length ?? 0) - output.length;
      console.log(`  ${removed.length} block(s), ${delta} chars`);

      if (alsoFiles) {
        const aligned = alignOutputFile(text.slug, { dropHeading }, write);
        if (aligned) {
          filesTouched++;
          console.log(`  ${write ? '✓' : '·'} staged file ${aligned.file} (${aligned.removed.map(r => r.rule).join(', ')})`);
        }
      }

      if (write) {
        const { error: updateError } = await supabase
          .from('texts')
          .update({ body: output })
          .eq('id', text.id);
        if (updateError) {
          console.error(`  ! update failed: ${updateError.message}`);
        } else {
          written++;
          console.log('  ✓ written');
        }
      }
      console.log('');
    }

    if (advisories.length > 0) {
      advised++;
      // Advisories are printed even when nothing was stripped — they are the
      // findings a human has to rule on, and a silent one is a finding lost.
      console.log(`${text.slug}  [advisory]`);
      for (const a of advisories) {
        console.log(`  ? ${a.rule}: ${a.why}`);
        console.log(`    ${a.excerpt}`);
      }
      console.log('');
    }
  }

  console.log('---');
  console.log(`${dirty} text(s) to change`);
  console.log(`${advised} text(s) have advisory findings for review`);
  if (dropLeadingHeading) {
    console.log(`${headingsKept} leading heading(s) kept — structural, keep-listed, or not the work's name`);
  }
  if (alsoFiles) {
    console.log(`${filesTouched} staged output file(s) ${write ? 'aligned' : 'would be aligned'}`);
  } else if (dirty > 0) {
    console.log('Staged output files untouched — pass --files to keep them in step.');
  }
  if (write) {
    console.log(`${written} text(s) updated`);
  } else if (dirty > 0) {
    console.log('Dry run — re-run with --write to apply.');
  }
  if (advised > 0 && !dropLeadingHeading) {
    console.log('Advisories are never written. --drop-leading-h1 opts into removing duplicated title headings.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
