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
 * Usage:
 *   node scripts/strip-source-chrome.mjs                    # scan every text, preview
 *   node scripts/strip-source-chrome.mjs --slug=<slug>      # one text by slug
 *   node scripts/strip-source-chrome.mjs --id=<uuid>        # one text by id
 *   node scripts/strip-source-chrome.mjs --drafts           # unpublished texts only
 *   node scripts/strip-source-chrome.mjs --drop-leading-h1  # also drop a duplicated title heading
 *   node scripts/strip-source-chrome.mjs --write            # apply
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { stripChrome } from './lib/source-chrome.mjs';

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
const slug = args.find(a => a.startsWith('--slug='))?.slice('--slug='.length);
const id = args.find(a => a.startsWith('--id='))?.slice('--id='.length);

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

  for (const text of texts) {
    const { output, removed, advisories } = stripChrome(text.body || '', { dropLeadingHeading });

    if (removed.length > 0) {
      dirty++;
      const state = text.published ? 'PUBLISHED' : 'draft';
      console.log(`${text.slug}  [${state}]`);
      for (const r of removed) {
        console.log(`  - ${r.rule}: ${r.excerpt}`);
      }
      const delta = (text.body?.length ?? 0) - output.length;
      console.log(`  ${removed.length} block(s), ${delta} chars`);

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
  console.log(`${dirty} text(s) carry source-site chrome`);
  console.log(`${advised} text(s) have advisory findings for review`);
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
