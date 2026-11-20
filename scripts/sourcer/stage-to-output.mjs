/**
 * stage-to-output.mjs — bridge a Sourcer staging bundle into the layout
 * `pipeline-import.mjs` consumes.
 *
 * The Sourcer stages `content/staging/<slug>/body.md` (the whole work, clean
 * markdown with `# … (Book N)` / `## Chapter N.` headings). The importer instead
 * reads `scripts/ingestion/output/<slug>/*.md` (one file per collection member,
 * each with frontmatter) plus a `status: "staged"` entry in
 * `scripts/ingestion/prospect-queue.json`. The legacy `split-into-chapters.mjs`
 * can't parse the Sourcer's inline headings, so this does the structural split by
 * the markdown headings the Sourcer emits.
 *
 * It writes ONLY under `scripts/ingestion/output/<slug>/` and prints the staged
 * queue entry for you to paste (or appends it with --write-queue). It sets
 * nothing about copyright and never publishes.
 *
 * Usage:
 *   node scripts/sourcer/stage-to-output.mjs <slug> \
 *     --by=book|single --author="…" --title="…" --genre="…" \
 *     --themes=slug,slug --tradition=<slug> --era=<slug> --death-year=N \
 *     [--source-attribution="…"] [--translation-notes="…"] [--provenance-notes="…"] \
 *     [--write-queue] [--dry]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { loadProspects, saveProspects } from '../lib/prospect-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STAGING_DIR = path.join(REPO_ROOT, 'content', 'staging');
const OUTPUT_DIR = path.join(REPO_ROOT, 'scripts', 'ingestion', 'output');

// A Book divider heading: "# … (Book II)" or "# Book II" etc. (H1 the Sourcer emits).
const BOOK_RE = /^#\s+.*\bBook\s+([IVXLCDM]+|\d+)\b.*$/i;

function parseArgs(argv) {
  const opts = {};
  const positional = [];
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, ...v] = a.slice(2).split('=');
      opts[k] = v.length ? v.join('=') : true;
    } else positional.push(a);
  }
  return { opts, positional };
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/** Split body.md into parts at Book headings. Returns [{title, body}]. */
export function splitByBook(body) {
  const lines = body.split('\n');
  const heads = [];
  for (let i = 0; i < lines.length; i++) if (BOOK_RE.test(lines[i])) heads.push(i);
  if (heads.length === 0) return [];
  return heads.map((start, idx) => {
    const end = idx + 1 < heads.length ? heads[idx + 1] : lines.length;
    const title = lines[start].replace(/^#\s+/, '').trim();
    const partBody = lines.slice(start + 1, end).join('\n').trim();
    return { title, body: partBody };
  });
}

function frontmatter(fields) {
  const esc = (s) => String(s ?? '').replace(/"/g, '\\"');
  const themes = (fields.themes || []).map((t) => `"${esc(t)}"`).join(', ');
  return [
    '---',
    `title: "${esc(fields.title)}"`,
    `slug: "${esc(fields.slug)}"`,
    `author: "${esc(fields.author)}"`,
    `genre: "${esc(fields.genre)}"`,
    `themes: [${themes}]`,
    `collection: "${esc(fields.collection)}"`,
    `collection_order: ${fields.order}`,
    `source_attribution: "${esc(fields.sourceAttribution)}"`,
    `provenance_notes: "${esc(fields.provenanceNotes)}"`,
    `translation_notes: "${esc(fields.translationNotes)}"`,
    `ocr_quality: "high"`,
    'published: false',
    'copyright_safe: true',
    'note_draft: ""',
    '---',
    '',
  ].join('\n');
}

async function main() {
  const { opts, positional } = parseArgs(process.argv.slice(2));
  const slug = positional[0];
  if (!slug) {
    console.error('Usage: node scripts/sourcer/stage-to-output.mjs <slug> --by=book|single --author="…" --title="…" --genre="…" --themes=a,b --tradition=<slug> --era=<slug> --death-year=N [--write-queue] [--dry]');
    process.exit(1);
  }
  const bodyPath = path.join(STAGING_DIR, slug, 'body.md');
  if (!fs.existsSync(bodyPath)) {
    console.error(`No staged body at ${path.relative(REPO_ROOT, bodyPath)} — run the Sourcer first.`);
    process.exit(1);
  }
  const body = fs.readFileSync(bodyPath, 'utf8');
  const themes = opts.themes ? String(opts.themes).split(',').map((t) => t.trim()).filter(Boolean) : [];
  const meta = {
    author: opts.author || '',
    genre: opts.genre || '',
    themes,
    collection: slug,
    sourceAttribution: opts['source-attribution'] || '',
    provenanceNotes: opts['provenance-notes'] || '',
    translationNotes: opts['translation-notes'] || '',
  };

  const by = opts.by || 'book';
  let parts;
  if (by === 'single') {
    parts = [{ title: opts.title || slug, body: body.trim() }];
  } else {
    parts = splitByBook(body);
    if (parts.length === 0) {
      console.error('No Book headings found; pass --by=single to import as one text, or check body.md.');
      process.exit(1);
    }
  }

  const outDir = path.join(OUTPUT_DIR, slug);
  const files = parts.map((p, i) => {
    const order = i + 1;
    const fileSlug = `${slug}-${String(order).padStart(2, '0')}-${slugify(p.title)}`;
    const fm = frontmatter({ ...meta, title: p.title, slug: fileSlug, order });
    return { file: path.join(outDir, `${fileSlug}.md`), content: fm + p.body + '\n', title: p.title, order, words: p.body.split(/\s+/).filter(Boolean).length };
  });

  if (!opts.dry) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const f of files) fs.writeFileSync(f.file, f.content, 'utf8');
  }

  console.log(`${opts.dry ? '(dry) ' : ''}${by === 'single' ? '1 text' : `${files.length} book file(s)`} → ${path.relative(REPO_ROOT, outDir)}`);
  for (const f of files) console.log(`  ${String(f.order).padStart(2)}. ${f.title}  (${f.words} words)`);

  // The staged queue entry (author-level fields come from you — not the bundle).
  const entry = {
    id: slug,
    status: 'staged',
    added: new Date().toISOString().slice(0, 10),
    author: meta.author,
    death_year: opts['death-year'] ? Number(opts['death-year']) : null,
    tradition: opts.tradition || '',
    era: opts.era || '',
    title: opts.title || meta.author,
    genre: meta.genre,
    collection_slug: slug,
    source_type: 'sourcer',
  };

  if (opts['write-queue'] && !opts.dry) {
    // The queue is the `prospects` table (migration 041), or the JSON file until it runs.
    dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = url && key ? createClient(url, key) : null;
    const { source, prospects } = await loadProspects(supabase);
    if (prospects.some((p) => p.id === slug || p.collection_slug === slug)) {
      console.log(`\n! queue already has an entry for "${slug}" — not appending (edit it by hand if needed).`);
    } else {
      await saveProspects(supabase, source, source === 'db' ? [entry] : [...prospects, entry]);
      console.log(`\n✓ Appended staged queue entry for "${slug}" (${source === 'db' ? 'prospects table' : 'prospect-queue.json'}).`);
    }
  } else {
    console.log('\nAdd this to the prospect queue (or re-run with --write-queue):\n');
    console.log(JSON.stringify(entry, null, 2));
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((err) => { console.error(err); process.exit(1); });
