/**
 * fetch-gutenberg-plates.mjs — pull an illustrated Gutenberg edition's plates local
 *
 * A Project Gutenberg HTML edition references its illustrations by a path
 * relative to the ebook's own directory: `![Caption](images/i_020.jpg)`. Fetched
 * into a body here, those paths resolve to nothing — the reader sees a broken
 * image where a plate should be. This downloads them from a Gutenberg mirror,
 * writes them under `public/plates/<slug>/` (served by Next at `/plates/<slug>/…`)
 * and rewrites the markdown to point at the local copy.
 *
 * It also **normalises the caption**. Gutenberg's HTML puts the caption in three
 * places at once — the alt text, the title attribute and a line of prose after
 * the image — so a naive conversion renders it twice, once as the figure's
 * caption and once as a stray paragraph, followed by a `See page 15` reference
 * to a pagination that does not exist online. The rewrite keeps the caption as
 * alt text (which `MarkdownBody` renders as a figcaption) and drops the other
 * two. Nothing is lost.
 *
 * Dry-run by default. `--write` downloads and rewrites the staged markdown; the
 * Supabase body is only touched with `--db`, and only for an unpublished text.
 *
 * WHERE TO RUN THIS: anywhere with outbound access to a Gutenberg mirror.
 * `www.gutenberg.org` itself is blocked from the cloud agent environment, which
 * is why MIRRORS below lists mirrors rather than the canonical host — the same
 * constraint backfill-author-images.mjs documents for Wikipedia.
 *
 * HARD CONSTRAINTS: none apply — this writes `body` only. It never touches
 * `published`, `note_draft`, `editorial_introduction`, or an author's `draft`.
 *
 * Usage:
 *   node scripts/ingestion/fetch-gutenberg-plates.mjs --slug=<slug> --ebook=39452
 *   node scripts/ingestion/fetch-gutenberg-plates.mjs --slug=<slug> --ebook=39452 --write
 *   node scripts/ingestion/fetch-gutenberg-plates.mjs --slug=<slug> --ebook=39452 --write --db
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), override: true });

const args = process.argv.slice(2);
const arg = (flag) => args.find(a => a.startsWith(`${flag}=`))?.slice(flag.length + 1) ?? null;
const SLUG = arg('--slug');
const EBOOK = arg('--ebook');
const WRITE = args.includes('--write');
const DB = args.includes('--db');

if (!SLUG || !EBOOK) {
  console.error('Usage: --slug=<text-slug> --ebook=<gutenberg id> [--write] [--db]');
  process.exit(1);
}

// Gutenberg's own host blocks the cloud agent environment; these mirrors serve
// the same `<id>-h/` tree. Tried in order, first to answer 200 wins.
const MIRRORS = [
  id => `https://gutenberg.pglaf.org/${id.split('').slice(0, -1).join('/')}/${id}/${id}-h/images/`,
  id => `https://mirror.csclub.uwaterloo.ca/gutenberg/${id.split('').slice(0, -1).join('/')}/${id}/${id}-h/images/`,
];

const MAX_BYTES = 5_000_000;
const PLATE_DIR = path.join(ROOT, 'public', 'plates', SLUG);
const PUBLIC_PREFIX = `/plates/${SLUG}/`;

/**
 * Match one Gutenberg plate and everything Gutenberg duplicates around it:
 * the image (with its optional title attribute), the caption repeated as
 * prose, and the trailing `See page N`. Captions can contain a hard-wrapped
 * newline, so whitespace is matched loosely and collapsed on the way out.
 */
const PLATE = /!\[([^\]]*)\]\(images\/([\w.-]+)(?:\s+"[^"]*")?\)[ \t]*([^\n]*)\n?(?:See page \d+)?/g;

const collapse = (s) => s.replace(/\s+/g, ' ').trim();

function findOutputFile() {
  const base = path.join(ROOT, 'scripts', 'ingestion', 'output');
  const flat = path.join(base, `${SLUG}.md`);
  if (fs.existsSync(flat)) return flat;
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === `${SLUG}.md`) return p;
    }
  }
  return null;
}

/** Rewrite every plate reference; returns the new markdown and what it found. */
function rewrite(markdown) {
  const plates = [];
  const output = markdown.replace(PLATE, (whole, alt, file, trailing) => {
    const caption = collapse(alt) || collapse(trailing);
    plates.push({ file, caption });
    return `![${caption}](${PUBLIC_PREFIX}${file})`;
  });
  return { output, plates };
}

async function download(file) {
  for (const mirror of MIRRORS) {
    const url = mirror(EBOOK) + file;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Stromata/1.0 (personal research tool; thestromata.com)' } });
      if (!res.ok) continue;
      const type = res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      if (!type.startsWith('image/')) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES) return { ok: false, reason: `larger than 5 MB`, url };
      return { ok: true, bytes, url };
    } catch {
      // try the next mirror
    }
  }
  return { ok: false, reason: 'no mirror served it' };
}

async function main() {
  const file = findOutputFile();
  if (!file) {
    console.error(`No staged output found for ${SLUG}.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(file, 'utf-8');
  const { output, plates } = rewrite(raw);
  if (plates.length === 0) {
    console.log(`No source-relative plates in ${path.relative(ROOT, file)} — nothing to do.`);
    return;
  }

  console.log(`${WRITE ? 'Fetching' : 'Would fetch'} ${plates.length} plate(s) for ${SLUG}\n`);
  for (const p of plates) console.log(`  ${p.file}  ${p.caption}`);
  console.log('');

  if (!WRITE) {
    console.log(`Dry run — re-run with --write to download into public/plates/${SLUG}/ and rewrite the markdown.`);
    return;
  }

  fs.mkdirSync(PLATE_DIR, { recursive: true });
  let failed = 0;
  for (const p of plates) {
    const target = path.join(PLATE_DIR, p.file);
    if (fs.existsSync(target)) {
      console.log(`  = ${p.file} already present`);
      continue;
    }
    const res = await download(p.file);
    if (!res.ok) {
      failed++;
      console.error(`  ! ${p.file}: ${res.reason}`);
      continue;
    }
    fs.writeFileSync(target, res.bytes);
    console.log(`  + ${p.file} (${(res.bytes.byteLength / 1024).toFixed(0)} KB) from ${res.url}`);
  }
  if (failed > 0) {
    console.error(`\n${failed} plate(s) could not be fetched — markdown NOT rewritten, so nothing points at a missing file.`);
    process.exit(1);
  }

  fs.writeFileSync(file, output);
  console.log(`\n✓ rewrote ${path.relative(ROOT, file)}`);

  if (!DB) {
    console.log('Supabase body untouched — pass --db to rewrite it too.');
    return;
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: text, error } = await supabase
    .from('texts')
    .select('id, slug, published, body')
    .eq('slug', SLUG)
    .single();
  if (error || !text) {
    console.error(`  ! could not read ${SLUG} from Supabase: ${error?.message ?? 'not found'}`);
    process.exit(1);
  }
  if (text.published) {
    // A published body is live; changing it is Keith's call, not a script's.
    console.error(`  ! ${SLUG} is published — refusing to rewrite its body. Do it from the edit form.`);
    process.exit(1);
  }
  const { output: newBody, plates: dbPlates } = rewrite(text.body || '');
  if (dbPlates.length === 0) {
    console.log('  = Supabase body already has no source-relative plates.');
    return;
  }
  const { error: updateError } = await supabase.from('texts').update({ body: newBody }).eq('id', text.id);
  if (updateError) {
    console.error(`  ! update failed: ${updateError.message}`);
    process.exit(1);
  }
  console.log(`✓ rewrote ${dbPlates.length} plate reference(s) in Supabase`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
