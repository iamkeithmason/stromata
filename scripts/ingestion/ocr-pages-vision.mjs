/**
 * ocr-pages-vision.mjs — re-read an Archive.org scan from its PAGE IMAGES
 * instead of from the OCR text somebody else ran in 2010.
 *
 * WHY THIS EXISTS. `extract-djvu-xml.mjs` recovered the *arrangement* of the
 * 1743 Psychomachia and said so plainly: "it does not improve the OCR. A word
 * the scanner read wrong is read wrong here too." That was the right division
 * of labour, and it left the letters where they were — which on a British
 * Library microfilm of eighteenth-century type is not good enough to publish.
 * Measured on the staged text with scripts/lib/couplet-check.mjs: 74 lines
 * carrying obvious wreckage and a couplet rhyme rate of 30.5%, against ~100%
 * for the same pages read off the images. The scan had also dropped 72 lines
 * outright — 5.5% of the poem simply absent, with nothing in the text to show
 * for it.
 *
 * None of that is a limit of the scan. It is a limit of the OCR engine that
 * read it. The images are still there at ~4800x7800, and a model that can see
 * handles long s, ligatures and italic without a single hand-written rule.
 *
 * THE DIVISION OF LABOUR, which is the whole design:
 *
 *   the XML  gives structure — how many lines are on each page, where they
 *            sit, and (via the pitch test) how many the scan LOST.
 *   the eye  gives letters — what those lines actually say.
 *
 * Neither is trusted alone. The XML's per-page line count is a prediction, and
 * `assemble` stops on any page whose transcription does not match it. That is
 * the guard against the one failure mode that matters here: a model reading a
 * faint line will write something plausible, metrical and wrong, and unlike
 * `The #:/ of man` that kind of error is invisible to a reader. A line count
 * cannot be fooled by plausibility.
 *
 * But the prediction is itself fallible, and pretending otherwise would be the
 * same mistake in a new place. On leaf 26 the pitch test got three gaps exactly
 * right (4, 2 and 1 lines, all confirmed against the image) and still
 * over-counted the page by 2, having read a slightly wide space between two
 * couplets as dropped type. So a mismatch is a QUEUE, not a verdict: somebody
 * opens the scan, settles it, and records the finding as a named entry in
 * `visionLineCountAccepted` with its reason. What the guard buys is not
 * certainty — it is 71 pages narrowed to the handful that need an eye.
 *
 * WHO DOES THE READING. Deliberately not decided here. `prepare` writes page
 * crops and a manifest; `assemble` reads transcripts back. What fills the gap
 * between them is a separate question:
 *
 *   agents — subagents in a Claude Code session, one per batch of leaves. Runs
 *            on the operator's own subscription rather than API credit, which
 *            for a one-off recovery of a text that matters is the right trade.
 *   api    — a scripted pass for the next `archive_ocr` text, where a
 *            deterministic one-command run is worth more than the saving.
 *
 * Same crops, same manifest, same verification either way. Do not wire an API
 * key into this file to close the gap — the seam is the point.
 *
 * Usage:
 *   node scripts/ingestion/ocr-pages-vision.mjs prepare <config-key> [--force]
 *   node scripts/ingestion/ocr-pages-vision.mjs assemble <config-key> [--dry]
 *
 * `prepare` is idempotent and skips crops already on disk; `--force` refetches.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import CONFIGS from './archive-ocr-config.mjs';
import {
  parseDjvuXml,
  classifyLines,
  assemblePage,
  markVerseBreaks,
} from '../lib/djvu-layout.mjs';
import { checkCouplets } from '../lib/couplet-check.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// A crop is rendered to fit inside this box. Both numbers matter: the long
// side stays under the point where an image is downscaled before the model
// sees it, and within that box every page of this book lands at 60-90px of
// line pitch, which is comfortably legible. Fitting to the box rather than to
// a fixed width is what keeps a long page and a short one equally readable.
const FIT_W = 1500;
const FIT_H = 1560;

// ---------------------------------------------------------------------------

/** Where the working files for one text live. */
function paths(slug) {
  const work = path.join(ROOT, 'scripts/ingestion/work', slug);
  return {
    work,
    images: path.join(work, 'pages'),
    transcripts: path.join(work, 'transcripts'),
    manifest: path.join(work, 'manifest.json'),
  };
}

/**
 * Everything the XML can tell us about one leaf, before anyone looks at it.
 *
 * `expectedLines` is the count the transcription has to match: the lines the
 * scanner did read, plus the ones the line pitch says it missed. `djvuText` is
 * the old reading, carried through only so a reviewer can diff the two — it is
 * never merged into the output, because merging a known-bad reading with a
 * good one is how the bad one survives.
 */
function pageFacts(page, index, isHeading) {
  const classified = classifyLines(page);
  const { kept, suspectedGaps } = assemblePage(classified, { isHeading });
  const missing = suspectedGaps.reduce((n, g) => n + g.missing, 0);
  return {
    index,
    width: page.width,
    height: page.height,
    scannedLines: kept.length,
    suspectedMissing: missing,
    expectedLines: kept.length + missing,
    djvuText: kept.map((l) => l.text),
  };
}

/** The IIIF region + size for one leaf, from its own body block. */
function cropGeometry(page, facts) {
  const lines = classifyLines(page).filter((l) => l.role === 'body');
  if (!lines.length) return null;
  const top = Math.min(...lines.map((l) => l.y0));
  const bottom = Math.max(...lines.map((l) => l.y1));
  const pitch = lines.length > 1 ? (bottom - top) / lines.length : facts.height * 0.03;
  const pad = Math.round(pitch * 1.5);

  // Full measure horizontally, trimmed only of the gutter shadow. Cropping to
  // the detected block would be tighter, but the block is derived from the OCR
  // and on a page where the OCR went wrong it is wrong too — on leaf 41 it
  // starts a third of the way across the page. A generous margin costs a few
  // pixels of resolution; a tight one can cut the text off.
  const x = Math.round(page.width * 0.04);
  const w = Math.round(page.width * 0.92);
  const y = Math.max(0, top - pad);
  const h = Math.min(page.height - y, bottom - y + 2 * pad);

  const scale = Math.min(FIT_W / w, FIT_H / h, 1);
  return { x, y, w, h, renderWidth: Math.round(w * scale), pitch: Math.round(pitch * scale) };
}

function iiifUrl(archiveId, index, g) {
  return `https://iiif.archive.org/iiif/${archiveId}%24${index}/${g.x},${g.y},${g.w},${g.h}/${g.renderWidth},/0/default.jpg`;
}

// ---------------------------------------------------------------------------

function loadPages(config) {
  const xmlPath = path.join(ROOT, config.xmlFile);
  if (!fs.existsSync(xmlPath)) {
    console.error(`Missing ${config.xmlFile}. Download it with:`);
    console.error(
      `  curl -L "https://archive.org/download/${config.archiveId}/${config.archiveId}_djvu.xml" \\\n    -o ${config.xmlFile}`,
    );
    process.exit(1);
  }
  return parseDjvuXml(fs.readFileSync(xmlPath, 'utf8'));
}

/** Match the config's heading patterns, so the pitch test skips display type. */
function headingMatcher(config) {
  const patterns = (config.headings ?? []).map(([p]) => new RegExp(p));
  return (text) => patterns.some((re) => re.test(text));
}

function prepare(config, { force }) {
  const pages = loadPages(config);
  const [first, last] = config.pages ?? [0, pages.length - 1];
  const isHeading = headingMatcher(config);
  const p = paths(config.slug);
  fs.mkdirSync(p.images, { recursive: true });
  fs.mkdirSync(p.transcripts, { recursive: true });

  const leaves = [];
  for (let i = first; i <= last; i++) {
    const page = pages[i];
    const facts = pageFacts(page, i, isHeading);
    if (!facts.expectedLines) {
      // A blank leaf or a plate. Recorded so the run is auditable, but nothing
      // to crop and nothing to read.
      leaves.push({ ...facts, image: null, skipped: 'no text on this leaf' });
      continue;
    }
    const g = cropGeometry(page, facts);
    const name = `n${String(i).padStart(3, '0')}.jpg`;
    const file = path.join(p.images, name);
    if (force || !fs.existsSync(file)) {
      execFileSync('curl', ['-sL', '--fail', iiifUrl(config.archiveId, i, g), '-o', file]);
      process.stdout.write('.');
    }
    leaves.push({
      ...facts,
      image: path.relative(ROOT, file),
      transcript: path.relative(ROOT, path.join(p.transcripts, `n${String(i).padStart(3, '0')}.txt`)),
      renderedPitch: g.pitch,
    });
  }
  process.stdout.write('\n');

  const manifest = {
    slug: config.slug,
    title: config.title,
    archiveId: config.archiveId,
    pages: [first, last],
    preparedAt: new Date().toISOString().slice(0, 10),
    leaves,
  };
  fs.writeFileSync(p.manifest, `${JSON.stringify(manifest, null, 2)}\n`);

  const withText = leaves.filter((l) => l.image);
  console.log(`✓ ${withText.length} leaves cropped into ${path.relative(ROOT, p.images)}`);
  console.log(`✓ Manifest: ${path.relative(ROOT, p.manifest)}`);
  console.log(
    `  Expecting ${withText.reduce((n, l) => n + l.expectedLines, 0)} lines ` +
      `(${withText.reduce((n, l) => n + l.suspectedMissing, 0)} of them lines the old OCR dropped).`,
  );
  console.log(`\nWrite one transcript per leaf into ${path.relative(ROOT, p.transcripts)}, then:`);
  console.log(`  node scripts/ingestion/ocr-pages-vision.mjs assemble ${key}`);
}

// ---------------------------------------------------------------------------

function assemble(config, { dry }) {
  const p = paths(config.slug);
  if (!fs.existsSync(p.manifest)) {
    console.error(`No manifest. Run \`prepare\` first.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(p.manifest, 'utf8'));

  const lines = [];
  const mismatches = [];
  const adjudicated = [];
  const untranscribed = [];

  for (const leaf of manifest.leaves) {
    if (!leaf.image) continue;
    const file = path.join(ROOT, leaf.transcript);
    if (!fs.existsSync(file)) {
      untranscribed.push(leaf.index);
      continue;
    }
    const got = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.trim());

    // The guard. A page that reads short or long against the XML's own count
    // needs a person, because the two ways to get here are a reader that
    // skipped a line and a reader that invented one.
    //
    // It is a QUEUE, not a verdict. The pitch test over-predicts: on leaf 26
    // it called 22 lines where the page plainly has 20, having read a slightly
    // wide space between two couplets as a dropped line. A gate that treated
    // its count as truth would reject a correct transcription, so a leaf is
    // cleared by a named entry in the config — with the reason, checked
    // against the page image — and by nothing else. An unexplained mismatch
    // still stops the run.
    const headings = got.filter((l) => l.startsWith('## ')).length;
    if (got.length !== leaf.expectedLines) {
      const accepted = (config.visionLineCountAccepted ?? {})[leaf.index];
      (accepted ? adjudicated : mismatches).push({
        index: leaf.index,
        expected: leaf.expectedLines,
        got: got.length,
        headings,
        reason: accepted,
      });
    }
    lines.push(...got);
  }

  if (untranscribed.length) {
    console.error(`✗ ${untranscribed.length} leaves have no transcript: ${untranscribed.join(', ')}`);
    if (!dry) process.exit(1);
  }
  if (adjudicated.length) {
    console.log(`  ${adjudicated.length} leaves differ from the pitch test's count, each cleared by hand:`);
    for (const m of adjudicated) {
      console.log(`    leaf ${m.index}: predicted ${m.expected}, read ${m.got} — ${m.reason}`);
    }
  }
  if (mismatches.length) {
    console.error(`\n✗ ${mismatches.length} leaves disagree with the scan's own line count:`);
    for (const m of mismatches) {
      console.error(
        `    leaf ${m.index}: predicted ${m.expected} lines, read ${m.got}` +
          (m.headings ? ` (${m.headings} of them a heading)` : ''),
      );
      console.error(
        `      https://archive.org/details/${manifest.archiveId}/page/n${m.index}/mode/1up`,
      );
    }
    console.error(
      '\nOpen each scan and settle it. If the transcription is right and the pitch',
    );
    console.error(
      '  test over-counted, add the leaf to `visionLineCountAccepted` in',
    );
    console.error(
      '  archive-ocr-config.mjs with the reason. Otherwise fix the transcript.',
    );
    console.error('Nothing was written.');
    if (!dry) process.exit(1);
  }

  let text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (config.verse) text = markVerseBreaks(text.split('\n')).join('\n');

  const verseLines = lines.filter((l) => !l.startsWith('## '));
  const report = checkCouplets(verseLines);

  const frontmatter = `---
title: ${JSON.stringify(config.title)}
slug: ${JSON.stringify(config.slug)}
author: ${JSON.stringify(config.author)}
genre: ${JSON.stringify(config.genre)}
themes: ${JSON.stringify(config.themes ?? [])}
source_attribution: ${JSON.stringify(config.sourceAttribution ?? '')}
provenance_notes: ${JSON.stringify(config.provenanceNotes ?? '')}
translation_notes: ${JSON.stringify(config.translationNotes ?? '')}
${config.noteDraft ? `note_draft: ${JSON.stringify(config.noteDraft)}\n` : ''}ocr_quality: ${JSON.stringify(config.ocrQualityAfterVision ?? config.ocrQuality ?? 'medium')}
published: false
copyright_safe: true
---
`;

  const link = (n) => `https://archive.org/details/${manifest.archiveId}/page/n${n}/mode/1up`;
  const review = [
    `# Review — ${config.title} (read from the page images)`,
    '',
    `Re-read from the scan's page images, not its \`_djvu.txt\`/\`_djvu.xml\` OCR.`,
    `${verseLines.length} lines of verse across ${manifest.leaves.filter((l) => l.image).length} leaves.`,
    adjudicated.length
      ? `${adjudicated.length} leaves were read against the scan by hand where the pitch test disagreed; every other leaf matched its predicted line count.`
      : `Every leaf matched the line count the XML's pitch analysis predicted for it.`,
    '',
    '## Couplet check',
    '',
    'The poem is in heroic couplets, so the form is a checksum on the reading.',
    'These numbers are only meaningful next to the previous ones — see CHANGELOG.',
    '',
    `- Couplets: ${report.pairs}`,
    `- Rhyme rate: **${(report.rhymeRate * 100).toFixed(1)}%**`,
    `- Lines carrying obvious wreckage: **${report.garbled.length}**`,
    '',
    ...(report.garbled.length
      ? [
          '### Lines to look at — these are near enough always a fault',
          '',
          ...report.garbled.map((g) => `- [ ] line ${g.line} (${g.reason}): \`${g.text}\``),
          '',
        ]
      : ['No line carries a numeral or ends in something that is not a word.', '']),
    '### Couplets that do not rhyme',
    '',
    'Noisy on purpose. This text really does rhyme seat/State and join/divine,',
    'so a flag here is a suggestion to glance, never evidence of a fault.',
    '',
    ...report.noRhyme.slice(0, 80).map((f) => `- [ ] line ${f.line}: …${f.endings[0]} / …${f.endings[1]}`),
    ...(report.noRhyme.length > 80 ? ['', `_…and ${report.noRhyme.length - 80} more._`] : []),
    '',
    '## Leaves',
    '',
    ...manifest.leaves
      .filter((l) => l.image)
      .map(
        (l) =>
          `- leaf ${l.index}: ${l.expectedLines} lines` +
          (l.suspectedMissing ? ` (${l.suspectedMissing} the old OCR had dropped)` : '') +
          ` — [scan](${link(l.index)})`,
      ),
    '',
  ].join('\n');

  const outDir = path.join(ROOT, 'scripts/ingestion/output');
  const outFile = path.join(outDir, `${config.slug}.md`);
  const reviewFile = path.join(outDir, `${config.slug}-review.md`);

  console.log(`Lines: ${verseLines.length}  Couplets: ${report.pairs}`);
  console.log(`Rhyme rate: ${(report.rhymeRate * 100).toFixed(1)}%   Garbled lines: ${report.garbled.length}`);

  if (dry) {
    console.log('\n--dry: nothing written.');
    return;
  }
  fs.writeFileSync(outFile, `${frontmatter}\n${text}\n`);
  fs.writeFileSync(reviewFile, review);
  console.log(`✓ Written: ${path.relative(ROOT, outFile)}`);
  console.log(`✓ Written: ${path.relative(ROOT, reviewFile)}`);
}

// ---------------------------------------------------------------------------

const [command, key, ...flags] = process.argv.slice(2);
const config = CONFIGS[key];

if (!['prepare', 'assemble'].includes(command) || !config) {
  console.error('Usage:');
  console.error('  node scripts/ingestion/ocr-pages-vision.mjs prepare <config-key> [--force]');
  console.error('  node scripts/ingestion/ocr-pages-vision.mjs assemble <config-key> [--dry]');
  console.error(`\nConfig keys: ${Object.keys(CONFIGS).join(', ')}`);
  process.exit(1);
}
if (!config.xmlFile || !config.archiveId) {
  console.error(`Config "${key}" needs both xmlFile and archiveId.`);
  process.exit(1);
}

if (command === 'prepare') prepare(config, { force: flags.includes('--force') });
else assemble(config, { dry: flags.includes('--dry') });
