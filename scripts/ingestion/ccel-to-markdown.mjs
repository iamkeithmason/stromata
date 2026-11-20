#!/usr/bin/env node
/**
 * ccel-to-markdown.mjs — stage a CCEL plain-text export as pipeline output.
 *
 *   node scripts/ingestion/ccel-to-markdown.mjs <cache .txt URL or local file> \
 *     --slug=<collection_slug> --title="…" --author="…" --genre=<Genre> \
 *     [--start="EXACT HEADING"] [--end="EXACT HEADING"] [--flat] [--dry]
 *
 * Writes scripts/ingestion/output/<slug>/<title-slug>.md: one text, headings kept,
 * footnotes dropped, with a frontmatter stub (themes and note_draft left for
 * Stages 3 and 4, as extract-docx.mjs does). --start/--end cut one work out of a
 * combined file (Anselm's Basic Works holds four); each is the exact text of a
 * block, inclusive of start and exclusive of end. --flat makes flush-left heads
 * ## instead of ### (for books whose chapters are flush-left, like All of Grace).
 *
 * Splitting a long work into a collection stays a judgement call (Julian's
 * Revelations went by Revelation, not by chapter); do it on the output by hand.
 *
 * Reads only ccel.org. Meters: none beyond one fetch from CCEL.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCcel, toMarkdown, findBlock } from '../lib/ccel-text.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');

const opts = {};
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) opts[m[1]] = m[2] ?? true;
  else positional.push(a);
}
const src = positional[0];
if (!src || !opts.slug || !opts.title || !opts.author) {
  console.error('Usage: ccel-to-markdown.mjs <url|file> --slug=… --title="…" --author="…" [--genre=…] [--start="…"] [--end="…"] [--flat] [--dry]');
  process.exit(2);
}

let raw;
if (/^https?:\/\//.test(src)) {
  const u = new URL(src);
  if (!/(^|\.)ccel\.org$/.test(u.hostname) || !u.pathname.endsWith('.txt')) {
    console.error('Only ccel.org plain-text exports (…/cache/<work>.txt) are accepted.');
    process.exit(2);
  }
  const res = await fetch(src, { headers: { 'User-Agent': 'Stromata/1.0 (personal research tool; thestromata.com)' } });
  if (!res.ok) {
    console.error(`HTTP ${res.status} for ${src}`);
    process.exit(1);
  }
  raw = await res.text();
} else {
  raw = fs.readFileSync(src, 'utf8');
}

// Read the header before anything else: a 200 is not proof of the right work.
const header = raw.slice(0, 600).match(/Title:\s*(.+)\n[\s\S]*?Creator\(s\):\s*(.+)/);
console.log(header ? `Source header: "${header[1].trim()}" by ${header[2].trim()}` : '⚠ No CCEL header found — check this is the right file.');

let blocks = parseCcel(raw);
const start = opts.start ? findBlock(blocks, opts.start) : 0;
if (start === -1) {
  console.error(`--start "${opts.start}" not found.`);
  process.exit(1);
}
const endAt = opts.end ? findBlock(blocks, opts.end, start + 1) : findBlock(blocks, 'Indexes', start + 1);
if (opts.end && endAt === -1) {
  console.error(`--end "${opts.end}" not found after --start.`);
  process.exit(1);
}
blocks = blocks.slice(start, endAt === -1 ? blocks.length : endAt);
// Without --start, skip CCEL's catalogue header (the block before the first rule-bounded section).
if (!opts.start) blocks = blocks.filter((b) => !/^(Title|Creator\(s\)|CCEL Subjects|LC Call no|LC Subjects):/.test(b.text || ''));

const body = toMarkdown(blocks, { flatHeadings: !!opts.flat });
const textSlug = String(opts.title).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const q = (v) => JSON.stringify(v ?? '');
const fm = [
  '---',
  `title: ${q(opts.title)}`,
  `slug: ${q(textSlug)}`,
  `author: ${q(opts.author)}`,
  `genre: ${q(opts.genre || '')}`,
  'themes: []  # TODO — Stage 3: 2–6 slugs from the controlled vocabulary',
  `collection: ${q(opts.slug)}`,
  'collection_order: 1',
  `source_url: ${q(/^https?:/.test(src) ? src : '')}`,
  'source_attribution: ""  # TODO — the edition: translator, publisher, year',
  `provenance_notes: ${q(`Text sourced from the Christian Classics Ethereal Library's plain-text edition (ccel.org). Accessed ${new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })}.`)}`,
  'translation_notes: ""  # TODO — translator dates and copyright basis',
  'ocr_quality: "high"',
  'published: false',
  'copyright_safe: true',
  'note_draft: ""',
  '---',
  '',
].join('\n');

const words = body.split(/\s+/).filter(Boolean).length;
const headings = (body.match(/^#{2,3} /gm) || []).length;
const file = path.join(OUTPUT_DIR, opts.slug, `${textSlug}.md`);
console.log(`${words.toLocaleString()} words, ${headings} headings → ${path.relative(process.cwd(), file)}`);
if (opts.dry) {
  console.log('\n--dry: first lines of the body:\n');
  console.log(body.split('\n').slice(0, 24).join('\n'));
} else {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, fm + '\n' + body);
  console.log('Written. Fill themes, source_attribution, translation_notes and note_draft before staging.');
}
