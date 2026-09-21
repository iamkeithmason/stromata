/**
 * extract-djvu-xml.mjs — stage an Archive.org scan from its `_djvu.xml`
 * rather than its `_djvu.txt`.
 *
 * Use this instead of clean-archive-ocr.mjs whenever the page layout carries
 * meaning: verse, drama, anything with catchwords, signature marks or
 * marginalia. The .txt is the same OCR with the layout thrown away, and on the
 * 1743 Psychomachia that cost real damage — couplets merged two to a line,
 * run-overs orphaned, page numbers spliced into the middle of lines, and on
 * several pages the lines delivered in the wrong ORDER. Reading the XML got
 * all of it back without a single hand-written rule about brackets or digits.
 *
 * Usage:
 *   node scripts/ingestion/extract-djvu-xml.mjs <config-key>
 *   node scripts/ingestion/extract-djvu-xml.mjs <config-key> --dry
 *
 * The config lives in archive-ocr-config.mjs alongside the .txt ones — same
 * metadata fields, plus `xmlFile`, `pages` and `headings`. Download the XML
 * with:
 *   curl -L "https://archive.org/download/<id>/<id>_djvu.xml" -o scripts/ingestion/sources/<slug>-raw.xml
 *
 * It writes two files. The markdown is the staged text. The review file is the
 * one that matters at Stage 3: every line the extractor dropped and why, every
 * place the scan appears to have LOST a line, and every line the scanner itself
 * was unsure of. Nothing is removed silently, because a line of the poem going
 * missing with no trace is the one failure this whole approach exists to avoid.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import CONFIGS from './archive-ocr-config.mjs';
import {
  parseDjvuXml,
  classifyLines,
  assemblePage,
  lowConfidence,
  markVerseBreaks,
  stripStrayMarks,
  applyWordFixes,
} from '../lib/djvu-layout.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

const [key, ...flags] = process.argv.slice(2);
const dry = flags.includes('--dry');

if (!key || !CONFIGS[key]) {
  console.error(`Usage: node scripts/ingestion/extract-djvu-xml.mjs <config-key> [--dry]`);
  console.error(`Known keys: ${Object.keys(CONFIGS).filter((k) => CONFIGS[k].xmlFile).join(', ')}`);
  process.exit(1);
}

const config = CONFIGS[key];
if (!config.xmlFile) {
  console.error(`"${key}" has no xmlFile — it is a .txt config, so use clean-archive-ocr.mjs.`);
  process.exit(1);
}

const xmlPath = path.join(ROOT, config.xmlFile);
if (!fs.existsSync(xmlPath)) {
  console.error(`Missing ${config.xmlFile}. Download it with:`);
  console.error(`  curl -L "https://archive.org/download/<id>/<id>_djvu.xml" -o ${config.xmlFile}`);
  process.exit(1);
}

console.log(`Reading: ${config.xmlFile}`);
const pages = parseDjvuXml(fs.readFileSync(xmlPath, 'utf8'));
console.log(`  ${pages.length} scanned pages`);

const [first, last] = config.pages ?? [0, pages.length - 1];

const lines = [];
const report = { dropped: [], gaps: [], suspect: [], marks: [] };

for (let i = first; i <= last && i < pages.length; i++) {
  const classified = classifyLines(pages[i], config.layout);
  const { kept, dropped, suspectedGaps } = assemblePage(classified, config.layout);

  for (const line of kept) lines.push({ ...line, page: i });
  for (const d of dropped) report.dropped.push({ page: i, role: d.role, text: d.text, why: d.why });
  for (const g of suspectedGaps) report.gaps.push({ page: i, ...g });
  for (const s of lowConfidence(kept, config.layout)) report.suspect.push({ page: i, ...s });
}

console.log(`  ${lines.length} lines of text from pages ${first}–${last}`);
console.log(`  ${report.dropped.length} lines dropped as page furniture`);
console.log(`  ${report.gaps.length} places where the scan appears to have lost a line`);
console.log(`  ${report.suspect.length} lines the scanner was unsure of`);

// ---------------------------------------------------------------------------
// Text corrections. Applied AFTER layout, because layout is decided from
// geometry and a correction only ever changes letters.
// ---------------------------------------------------------------------------

const cleaned = [];
for (const line of lines) {
  if (config.strayMarks === false) {
    cleaned.push(line.text);
    continue;
  }
  const { text: stripped, removed } = stripStrayMarks(line.text);
  if (removed.length) report.marks.push({ page: line.page, removed, kept: stripped });
  if (stripped.trim()) cleaned.push(stripped);
}
let text = cleaned.join('\n');

for (const [pattern, replacement, fl] of config.regexCorrections ?? []) {
  const re = new RegExp(pattern, fl || 'g');
  if (!re.test(text)) console.warn(`  ! regex correction never matched: /${pattern}/`);
  text = text.replace(new RegExp(pattern, fl || 'g'), replacement);
}

const fixes = applyWordFixes(text, config.wordFixes);
text = fixes.text;
for (const wrong of Object.keys(config.wordFixes ?? {})) {
  if (!fixes.applied.has(wrong)) console.warn(`  ! word fix never matched: "${wrong}"`);
}

for (const [broken, fixed] of Object.entries(config.manualCorrections ?? {})) {
  if (!text.includes(broken)) console.warn(`  ! manual correction never matched: "${broken.slice(0, 50)}"`);
  text = text.split(broken).join(fixed);
}

// Headings. Each entry is [pattern, heading]: the pattern matches however the
// scanner mangled the printed heading, and the heading is what gets written.
// They are named one by one rather than guessed, because a heading is the one
// place where a wrong reading silently restructures the whole text.
const headingsApplied = [];
for (const [pattern, heading] of config.headings ?? []) {
  const re = new RegExp(`^.*${pattern}.*$`, 'm');
  if (!re.test(text)) {
    console.warn(`  ! heading never matched: /${pattern}/`);
    continue;
  }
  text = text.replace(re, `\n## ${heading}\n`);
  headingsApplied.push(heading);
}

text = text
  .split('\n')
  .map((l) => l.replace(/\s{2,}/g, ' ').trimEnd())
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

if (config.verse) text = markVerseBreaks(text.split('\n')).join('\n');

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const frontmatter = `---
title: "${config.title}"
slug: "${config.slug}"
author: "${config.author}"
genre: "${config.genre}"
themes: ${JSON.stringify(config.themes ?? [])}
source_attribution: ${JSON.stringify(config.sourceAttribution ?? '')}
provenance_notes: ${JSON.stringify(config.provenanceNotes ?? '')}
translation_notes: ${JSON.stringify(config.translationNotes ?? '')}
${config.noteDraft ? `note_draft: ${JSON.stringify(config.noteDraft)}\n` : ''}ocr_quality: "${config.ocrQuality ?? 'medium'}"
published: false
copyright_safe: true
---
`;

const outDir = path.join(ROOT, 'scripts/ingestion/output');
const outFile = path.join(outDir, `${config.slug}.md`);
const reviewFile = path.join(outDir, `${config.slug}-review.md`);

const reviewBody = [
  `# Review — ${config.title}`,
  '',
  `Source: \`${config.xmlFile}\`, pages ${first}–${last} of ${pages.length}.`,
  `Extracted ${lines.length} lines. Headings applied: ${headingsApplied.length ? headingsApplied.join('; ') : 'none'}.`,
  '',
  '## Lines the scan appears to have lost',
  '',
  'A page of leaded verse has a near-constant line pitch, so a gap wider than the',
  'usual one means type that did not come through. Check these against the page',
  'images before publishing — this is damage that leaves no mark in the text.',
  '',
  ...(report.gaps.length
    ? report.gaps.map((g) => `- p.${g.page} — ~${g.missing} line(s) between “…${g.after.slice(-40)}” and “${g.before.slice(0, 40)}…”`)
    : ['- none']),
  '',
  '## Lines the scanner was unsure of',
  '',
  'Low confidence from the OCR itself. Not corrected here: guessing an',
  'eighteenth-century word from context is how an edition acquires readings no',
  'printed copy ever had.',
  '',
  ...(report.suspect.length
    ? report.suspect.map((s) => `- p.${s.page} (${s.conf}%) \`${s.text}\`${s.words.length ? ` — ${s.words.join(', ')}` : ''}`)
    : ['- none']),
  '',
  '## Stray marks removed from inside lines',
  '',
  'Specks, rules, press figures and marginal line numbers. Mostly nothing — but a',
  'lone letter here is occasionally all the scanner caught of a real word, which',
  'is why they are listed rather than dropped out of sight.',
  '',
  ...(report.marks.length
    ? report.marks.map((m) => `- p.${m.page} removed ${m.removed.map((r) => `\`${r}\``).join(' ')} → \`${m.kept}\``)
    : ['- none']),
  '',
  '## Dropped as page furniture',
  '',
  ...(report.dropped.length
    ? report.dropped.map((d) => `- p.${d.page} \`${d.role}\` \`${d.text}\` — ${d.why}`)
    : ['- none']),
  '',
].join('\n');

if (dry) {
  console.log('\n--- first 20 lines ---');
  console.log(text.split('\n').slice(0, 20).join('\n'));
  console.log('\n(--dry: nothing written)');
} else {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, `${frontmatter}\n${text}\n`);
  fs.writeFileSync(reviewFile, reviewBody);
  console.log(`\n✓ Written: ${path.relative(ROOT, outFile)}`);
  console.log(`✓ Written: ${path.relative(ROOT, reviewFile)}`);
  console.log('\nRead the review file before staging. It lists every dropped line and every');
  console.log('place the scan looks like it lost one.');
}
