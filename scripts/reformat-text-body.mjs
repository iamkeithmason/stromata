#!/usr/bin/env node

/**
 * reformat-text-body.mjs — push a corrected Markdown body into an existing text
 *
 * For texts that were imported before the pipeline gained automatic Markdown
 * normalisation and now render with merged paragraphs / missing headings, this
 * script updates ONLY the `body` column of a `texts` row to match a corrected
 * staged Markdown file, matched by the file's `slug` frontmatter.
 *
 * It never changes `published`, `note_draft`, `editorial_introduction`, themes,
 * genre, the author, or anything else — body text only. Dry-run by default;
 * pass --apply to write. Safe to re-run (idempotent: a body already matching the
 * file is left untouched).
 *
 * This is the delivery half of the Boethius reformat (the content fix lives in
 * scripts/ingestion/reformat-boethius-bodies.mjs). Publishing stays a manual
 * step in the admin text edit form (Stage 5b), exactly as before.
 *
 * Usage:
 *   node scripts/reformat-text-body.mjs                       # dry run, default Boethius files
 *   node scripts/reformat-text-body.mjs --apply               # apply the default Boethius files
 *   node scripts/reformat-text-body.mjs path/to/text.md ...   # dry run, specific file(s)
 *   node scripts/reformat-text-body.mjs path/to/text.md --apply
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const DEFAULT_FILES = [
  'ingestion/output/consolation-of-philosophy-alfred/consolation-of-philosophy-alfred-prose.md',
  'ingestion/output/consolation-of-philosophy-alfred/consolation-of-philosophy-alfred-lays.md',
].map((p) => path.join(__dirname, p));

// Same frontmatter/body split the pipeline importer uses: body is everything
// after the closing `---`, trimmed.
function parse(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error('No frontmatter found');
  const [, block, rest] = match;
  const data = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    data[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return { slug: data.slug, title: data.title, body: rest.trim() };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const fileArgs = args.filter((a) => !a.startsWith('--'));
  const files = fileArgs.length ? fileArgs.map((p) => path.resolve(p)) : DEFAULT_FILES;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  console.log(apply ? 'APPLY mode — will write body changes\n' : 'DRY RUN — no writes (pass --apply to write)\n');
  let changed = 0;
  let failed = 0;

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`✗ ${file} — file not found`);
      failed++;
      continue;
    }
    const { slug, title, body } = parse(fs.readFileSync(file, 'utf8'));
    if (!slug) {
      console.error(`✗ ${path.basename(file)} — no slug in frontmatter`);
      failed++;
      continue;
    }

    const { data: rows, error } = await supabase
      .from('texts')
      .select('id, slug, title, published, body')
      .eq('slug', slug);

    if (error) {
      console.error(`✗ ${slug} — query failed: ${error.message}`);
      failed++;
      continue;
    }
    if (!rows || rows.length === 0) {
      console.error(`✗ ${slug} — no text row with that slug (nothing to update)`);
      failed++;
      continue;
    }
    const row = rows[0];

    const before = (row.body || '').trim();
    const after = body;
    const beforeHeadings = (before.match(/^##\s+/gm) || []).length;
    const afterHeadings = (after.match(/^##\s+/gm) || []).length;

    if (before === after) {
      console.log(`· ${slug} — already up to date (published: ${row.published})`);
      continue;
    }

    console.log(
      `✎ ${slug} — "${title || row.title}" (published: ${row.published})\n` +
        `    headings ${beforeHeadings} → ${afterHeadings}  ·  ` +
        `body ${before.length} → ${after.length} chars  ·  ` +
        `paragraph blanks ${(before.match(/\n\n/g) || []).length} → ${(after.match(/\n\n/g) || []).length}`
    );

    if (apply) {
      const { error: upErr } = await supabase.from('texts').update({ body: after }).eq('id', row.id);
      if (upErr) {
        console.error(`    ✗ update failed: ${upErr.message}`);
        failed++;
        continue;
      }
      console.log('    ✓ body updated (published unchanged)');
    }
    changed++;
  }

  console.log(
    `\n${apply ? 'Updated' : 'Would update'} ${changed} text(s)` +
      (failed ? `, ${failed} problem(s)` : '') +
      (apply ? '' : '. Re-run with --apply to write.')
  );
  console.log('Publishing remains manual: review each in /admin/drafts and publish there.');
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
