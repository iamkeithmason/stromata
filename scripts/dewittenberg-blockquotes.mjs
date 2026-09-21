/**
 * dewittenberg-blockquotes.mjs — un-nest Project Wittenberg's indentation-only
 * blockquotes and drop the glued-on underscore-rule divider from texts
 * already in the DB.
 *
 * Project Wittenberg's older catechetical pages wrap their Q&A content in
 * `<blockquote><blockquote>` purely for visual indentation, never for an
 * actual quotation, which turndown renders as a "> " or "> > " prefix on
 * every line. See scripts/lib/dewittenberg-blockquote.mjs for the transform
 * and why it lives apart from scripts/lib/source-chrome.mjs (that module's
 * rules only ever drop whole blocks; this edits inside ones that must stay).
 *
 * NO WHOLE-CORPUS MODE, ON PURPOSE. Unlike strip-source-chrome.mjs, this
 * transform is not safely source-scoped by its own pattern — a line
 * starting with ">" is ordinary markdown for a REAL quotation, and this
 * corpus has plenty of them (a dry run against the whole `texts` table
 * during development matched 76 texts, most with nothing to do with
 * Wittenberg — e.g. a genuine quoted line of poetry in Clement's Stromata).
 * `--slug=` is therefore required; there is no "scan everything" default to
 * fall into by omitting a flag.
 *
 * Dry-run by default; nothing is written without --write. Idempotent: a body
 * with neither artefact is left byte-for-byte unchanged, so this is safe to
 * re-run.
 *
 * `--files` applies the same edit to the staged `scripts/ingestion/output`
 * markdown for each text it touches, matched by slug, so the DB and the file
 * it was imported from cannot drift apart.
 *
 * Usage:
 *   node scripts/dewittenberg-blockquotes.mjs --slug=<slug>                # one text, preview
 *   node scripts/dewittenberg-blockquotes.mjs --slug=<a> --slug=<b>        # several, preview
 *   node scripts/dewittenberg-blockquotes.mjs --slug=<slug> --files        # …and the staged .md too
 *   node scripts/dewittenberg-blockquotes.mjs --slug=<slug> --write        # apply
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { dewittenbergBlockquote } from './lib/dewittenberg-blockquote.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const supabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const args = process.argv.slice(2);
const write = args.includes('--write');
const alsoFiles = args.includes('--files');
const slugs = args.filter(a => a.startsWith('--slug=')).map(a => a.slice('--slug='.length));

if (slugs.length === 0) {
  console.error('Refusing to run with no --slug= given — see the file header for why there is no whole-corpus mode.');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, 'ingestion', 'output');

function stagedFiles() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];
  const out = [];
  const stack = [OUTPUT_DIR];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.endsWith('.md') && !entry.name.endsWith('review-summary.md')) out.push(full);
    }
  }
  return out.sort();
}

function alignStagedFiles({ write, slugs }) {
  const results = [];
  for (const file of stagedFiles()) {
    const raw = fs.readFileSync(file, 'utf-8');
    const end = raw.startsWith('---') ? raw.indexOf('\n---\n', 3) : -1;
    if (end === -1) continue;
    const head = raw.slice(0, end + 5);
    const body = raw.slice(end + 5);
    const fileSlug = head.match(/^slug:\s*"?([^"\n]+?)"?\s*$/m)?.[1];
    if (!fileSlug) continue;
    if (!slugs.includes(fileSlug)) continue;

    const output = dewittenbergBlockquote(body);
    if (output === body) continue;
    if (write) fs.writeFileSync(file, head + '\n' + output);
    results.push({ file: path.relative(path.join(__dirname, '..'), file), slug: fileSlug });
  }
  return results;
}

async function main() {
  const { data: texts, error } = await supabase()
    .from('texts')
    .select('id, slug, published, body')
    .in('slug', slugs);
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

  for (const text of texts) {
    const output = dewittenbergBlockquote(text.body || '');
    if (output === text.body) continue;

    dirty++;
    const state = text.published ? 'PUBLISHED' : 'draft';
    const delta = (text.body?.length ?? 0) - output.length;
    console.log(`${text.slug}  [${state}]  ${delta} char(s) removed`);

    if (write) {
      const { error: updateError } = await supabase()
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
  }

  console.log('---');
  console.log(`${dirty} text(s) to change`);
  if (alsoFiles) {
    const aligned = alignStagedFiles({ write, slugs });
    console.log('');
    for (const a of aligned) console.log(`  ${write ? '✓' : '·'} ${a.file}`);
    console.log(`\n${aligned.length} staged output file(s) ${write ? 'aligned' : 'would be aligned'}`);
  } else if (dirty > 0) {
    console.log('Staged output files untouched — pass --files to keep them in step.');
  }
  if (write) {
    console.log(`${written} text(s) updated`);
  } else if (dirty > 0) {
    console.log('Dry run — re-run with --write to apply.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
