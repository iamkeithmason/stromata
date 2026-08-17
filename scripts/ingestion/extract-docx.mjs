#!/usr/bin/env node

/**
 * extract-docx.mjs — Stage 2 (Google Drive .docx source)
 *
 * Turns a Word .docx into a staged Markdown file, ready for tagging and review.
 * This is the committed form of the previously-manual Drive extraction step.
 *
 * A .docx is a ZIP whose word/document.xml holds the content. Each Word
 * paragraph (<w:p>) becomes ONE Markdown line — which is exactly the
 * "single newline between paragraphs" shape that normalise-markdown.mjs is
 * built to fix. So the last thing this script does is run the normaliser over
 * its own output: paragraph blanks are inserted, headings/lists are spaced,
 * and any verse is flagged for review — no separate pass required.
 *
 * Heading paragraph styles (Heading1…Heading6, Title) become ATX headings, so
 * there is no [HeadingN] marker step to clean up afterwards. Bold/italic runs
 * are preserved. In-paragraph line breaks (Shift+Enter) become Markdown hard
 * breaks, which the normaliser keeps within the same paragraph.
 *
 * No dependencies — Node built-ins only (zlib for inflate).
 *
 * Usage:
 *   node scripts/ingestion/extract-docx.mjs <file.docx> [options]
 *
 *     --slug=<slug>      Output slug (default: derived from the filename)
 *     --title=<title>    Title for the frontmatter stub
 *     --author=<name>    Author for the frontmatter stub
 *     --genre=<genre>    Genre for the frontmatter stub
 *     --out-dir=<dir>    Output directory (default: scripts/ingestion/output)
 *     --no-frontmatter   Emit the body only, without a frontmatter stub
 *     --force            Overwrite an existing output file
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

import { normaliseMarkdown, overrideForFile } from '../normalise-markdown.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Minimal ZIP reader — pulls a single entry out of a .docx via the central
// directory (robust against streamed entries with data descriptors).
// ZIP64 is not handled; a .docx never needs it.
// ---------------------------------------------------------------------------

function readZipEntry(buf, entryName) {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  const minEocd = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minEocd; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('Not a valid .docx (no ZIP end-of-central-directory record found).');

  const entryCount = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // central directory offset

  for (let n = 0; n < entryCount; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt .docx central directory.');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const fnLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + fnLen);

    if (name === entryName) {
      if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Corrupt .docx local header.');
      const lFnLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lFnLen + lExtraLen;
      const compData = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return compData; // stored
      if (method === 8) return zlib.inflateRawSync(compData); // deflate
      throw new Error(`Unsupported ZIP compression method ${method} for ${entryName}.`);
    }
    p += 46 + fnLen + extraLen + commentLen;
  }
  throw new Error(`Entry not found in .docx: ${entryName}`);
}

// ---------------------------------------------------------------------------
// document.xml → Markdown (one line per <w:p>)
// ---------------------------------------------------------------------------

function unescapeXml(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&'); // ampersand last
}

function paragraphToMarkdown(pXml) {
  // Heading level from the paragraph style.
  let level = 0;
  const style = pXml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/);
  if (style) {
    const heading = style[1].match(/^Heading\s*([1-6])/i);
    if (heading) level = Math.min(6, parseInt(heading[1], 10));
    else if (/^Title$/i.test(style[1])) level = 1;
  }

  // Collect formatted text runs.
  const runRe = /<w:r\b[\s\S]*?<\/w:r>/g;
  const segments = [];
  let rm;
  while ((rm = runRe.exec(pXml)) !== null) {
    const run = rm[0];
    const props = (run.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/) || [''])[0];
    const bold = /<w:b\b(?![^>]*w:val="(?:false|0)")[^>]*\/?>/.test(props);
    const italic = /<w:i\b(?![^>]*w:val="(?:false|0)")[^>]*\/?>/.test(props);

    let text = '';
    const tokenRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<w:cr\b[^>]*\/?>/g;
    let tm;
    while ((tm = tokenRe.exec(run)) !== null) {
      if (tm[0].startsWith('<w:t>') || tm[0].startsWith('<w:t ')) text += unescapeXml(tm[1]);
      else if (tm[0].startsWith('<w:tab')) text += '\t';
      else text += '  \n'; // <w:br/> or <w:cr/> → Markdown hard break
    }
    if (text === '') continue;
    segments.push({ text, bold, italic });
  }

  // Coalesce adjacent runs that share formatting, so we don't emit **a****b**.
  const merged = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last.bold === seg.bold && last.italic === seg.italic) last.text += seg.text;
    else merged.push({ ...seg });
  }

  const text = merged
    .map(({ text, bold, italic }) => {
      if (!text.trim()) return text; // never wrap whitespace-only in emphasis
      if (bold && italic) return `***${text}***`;
      if (bold) return `**${text}**`;
      if (italic) return `*${text}*`;
      return text;
    })
    .join('');

  const line = (level > 0 ? '#'.repeat(level) + ' ' : '') + text;
  return line.replace(/\s+$/, ''); // trim trailing space/newline at paragraph end
}

function documentXmlToMarkdown(xml) {
  const body = (xml.match(/<w:body\b[\s\S]*?<\/w:body>/) || [xml])[0];
  const hasTable = /<w:tbl[\s>]/.test(body);

  const paraRe = /<w:p\b[^>]*\/>|<w:p\b[\s\S]*?<\/w:p>/g;
  const lines = [];
  let m;
  while ((m = paraRe.exec(body)) !== null) lines.push(paragraphToMarkdown(m[0]));

  return { body: lines.join('\n'), hasTable, paragraphCount: lines.length };
}

// ---------------------------------------------------------------------------
// Frontmatter stub (mirrors the shape emitted by clean-archive-ocr.mjs)
// ---------------------------------------------------------------------------

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function buildFrontmatter({ title, slug, author, genre }) {
  const month = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  return `---
title: "${title || '# TODO — confirm title'}"
slug: "${slug}"
author: "${author || '# TODO — confirm author'}"
genre: "${genre || '# TODO — choose from controlled vocabulary'}"
themes: []  # TODO — choose 2–6 theme slugs from the controlled vocabulary
source_attribution: "# TODO — translator/edition"
provenance_notes: "Text supplied from a Google Drive personal archive (.docx). Extracted ${month}."
translation_notes: "# TODO — confirm translator death date and translation copyright status"
published: false
copyright_safe: true
note_draft: ""
---

<!-- EDITORIAL INTRO — write 2–4 sentences here explaining what this text is and why it matters. -->

`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const positional = [];
  const opts = {};
  for (const arg of argv) {
    if (arg === '--no-frontmatter') opts.noFrontmatter = true;
    else if (arg === '--force') opts.force = true;
    else if (arg.startsWith('--slug=')) opts.slug = arg.slice(7);
    else if (arg.startsWith('--title=')) opts.title = arg.slice(8);
    else if (arg.startsWith('--author=')) opts.author = arg.slice(9);
    else if (arg.startsWith('--genre=')) opts.genre = arg.slice(8);
    else if (arg.startsWith('--out-dir=')) opts.outDir = arg.slice(10);
    else if (arg.startsWith('--')) console.warn(`Unknown option ignored: ${arg}`);
    else positional.push(arg);
  }

  const docxPath = positional[0];
  if (!docxPath) {
    console.error('Usage: node scripts/ingestion/extract-docx.mjs <file.docx> [--slug=] [--title=] [--author=] [--genre=] [--out-dir=] [--no-frontmatter] [--force]');
    process.exit(1);
  }
  if (!fs.existsSync(docxPath)) {
    console.error(`File not found: ${docxPath}`);
    process.exit(1);
  }

  const slug = opts.slug || slugify(path.basename(docxPath, path.extname(docxPath)));
  const outDir = opts.outDir || path.join(__dirname, 'output');
  const outPath = path.join(outDir, `${slug}.md`);

  if (fs.existsSync(outPath) && !opts.force) {
    console.error(`Output already exists: ${outPath}\nPass --force to overwrite.`);
    process.exit(1);
  }

  console.log(`Reading: ${docxPath}`);
  const buf = fs.readFileSync(docxPath);
  const xml = readZipEntry(buf, 'word/document.xml').toString('utf8');

  const { body, hasTable, paragraphCount } = documentXmlToMarkdown(xml);
  console.log(`Extracted ${paragraphCount} paragraph(s).`);
  if (hasTable) {
    console.warn('  ⚠ Document contains a Word table — cell text is extracted as plain paragraphs; rebuild the table by hand if needed.');
  }

  const frontmatter = opts.noFrontmatter ? '' : buildFrontmatter({ title: opts.title, slug, author: opts.author, genre: opts.genre });

  // Final step: normalise. Word paragraphs are single-newline separated, which
  // is exactly what the normaliser fixes — and it flags any verse.
  const { output, report } = normaliseMarkdown(frontmatter + body, { override: overrideForFile(outPath) });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, output, 'utf8');
  console.log(`✓ Written: ${outPath}`);
  console.log(
    `  normalised: ${report.blanksInserted} blank(s) inserted · ${report.headingsSpaced} heading(s) spaced · ` +
      `${report.listsPadded} list run(s) padded`
  );

  if (report.verseFlags.length > 0) {
    console.warn(`\n  ⚠ VERSE FLAGGED — ${report.verseFlags.length} run(s), left untouched, review before publish:`);
    for (const f of report.verseFlags) {
      console.warn(`       lines ${f.startLine}–${f.endLine}: "${f.preview}"`);
    }
  }

  if (!opts.noFrontmatter) {
    console.log('\nNext: fill the frontmatter TODOs (title/author/genre/themes/attribution), then run the pipeline import.');
  }
}

main();
