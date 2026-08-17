#!/usr/bin/env node

/**
 * clean-archive-ocr.mjs
 *
 * Cleans raw Archive.org OCR markdown files and extracts a single text
 * for ingestion into The Stromata. Designed to complement fetch-texts.mjs
 * for sources that cannot be fetched digitally.
 *
 * Usage:
 *   node scripts/ingestion/clean-archive-ocr.mjs <config-key>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stripFootnoteMarkers } from './footnote-strip.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const configKey = process.argv[2];
if (!configKey) {
  console.error('Usage: node clean-archive-ocr.mjs <config-key>');
  process.exit(1);
}

let allConfigs;
try {
  const configPath = path.join(__dirname, 'archive-ocr-config.mjs');
  allConfigs = (await import(configPath)).default;
} catch (e) {
  console.error('Could not load archive-ocr-config.mjs:', e.message);
  process.exit(1);
}

const config = allConfigs[configKey];
if (!config) {
  console.error(`No config found for key: "${configKey}"`);
  console.error('Available keys:', Object.keys(allConfigs).join(', '));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Read source file
// ---------------------------------------------------------------------------

const sourcePath = path.resolve(config.sourceFile);
if (!fs.existsSync(sourcePath)) {
  console.error(`Source file not found: ${sourcePath}`);
  process.exit(1);
}

console.log(`Reading: ${sourcePath}`);
const raw = fs.readFileSync(sourcePath, 'utf8');

// ---------------------------------------------------------------------------
// Extract the target section
// ---------------------------------------------------------------------------

function extractSection(text, startLandmark, endLandmark) {
  const startIdx = text.indexOf(startLandmark);
  if (startIdx === -1) throw new Error(`Start landmark not found: "${startLandmark}"`);
  const endIdx = endLandmark ? text.indexOf(endLandmark, startIdx + startLandmark.length) : text.length;
  if (endLandmark && endIdx === -1) throw new Error(`End landmark not found: "${endLandmark}"`);
  return text.slice(startIdx, endIdx);
}

console.log('Extracting section...');
let extracted;
try {
  extracted = extractSection(raw, config.startLandmark, config.endLandmark);
} catch (e) {
  console.error('Extraction failed:', e.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Clean the extracted text
// ---------------------------------------------------------------------------

function cleanOcrText(text, config) {
  const issues = [];

  // 1. Normalise line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Manual corrections first
  if (config.manualCorrections) {
    for (const [broken, fixed] of Object.entries(config.manualCorrections)) {
      if (text.includes(broken)) {
        text = text.split(broken).join(fixed);
        issues.push(`Manual correction applied: "${broken.slice(0, 60).replace(/\n/g, ' ')}..."`);
      } else {
        issues.push(`WARNING: Manual correction not found: "${broken.slice(0, 60).replace(/\n/g, ' ')}..."`);
      }
    }
  }


  // 2b. Regex corrections (for passages too garbled for exact matching)
  if (config.regexCorrections) {
    for (const [pattern, replacement, flags] of config.regexCorrections) {
      const re = new RegExp(pattern, flags || 'g');
      if (re.test(text)) {
        text = text.replace(new RegExp(pattern, flags || 'g'), replacement);
        issues.push('Regex correction applied: /' + pattern.slice(0, 50) + '/');
      } else {
        issues.push('WARNING: Regex correction did not match: /' + pattern.slice(0, 50) + '/');
      }
    }
  }

  // 3. Rejoin hyphenated line breaks (word-\ncontinuation)
  text = text.replace(/(\w)-\s*\n\s*(\w)/g, '$1$2');

  // 4. Collapse all whitespace within lines to single space
  text = text.split('\n').map(l => l.replace(/\s{2,}/g, ' ').trim()).join('\n');

  // 5. Strip stray OCR artefact lines and patterns
  const pageHeaderPatterns = (config.pageHeaderPatterns || []).map(p => new RegExp(p));
  const keptHeadings = config.keptHeadings || [];

  const lines = text.split('\n');
  const filtered = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';

    // Custom page header patterns
    for (const pat of pageHeaderPatterns) {
      if (pat.test(trimmed)) return '';
    }

    // Default: all-caps short line with optional trailing number = page header
    if (
      /^[A-Z][A-Z\s\.\*\-]+\s*\d*$/.test(trimmed) &&
      trimmed.length < 50 &&
      !keptHeadings.some(h => trimmed.includes(h))
    ) {
      return '';
    }

    return line;
  });

  text = filtered.join('\n');

  // 6. Strip inline OCR artefact characters
  text = text.replace(/\\\*/g, '');
  text = text.replace(/\\\[/g, '');
  text = text.replace(/\\\]/g, '');
  text = text.replace(/j\/>/g, '');
  text = text.replace(/\^V\\\*/g, '');
  text = text.replace(/%Jt\s*/g, '');
  text = text.replace(/iv\^V\\\*/g, '');
  text = text.replace(/\^\s*\n/g, '\n');
  text = text.replace(/\s\|\s/g, ' ');
  // Stray single characters on their own lines
  text = text.replace(/^\s*[A-Z*^|\\]{1,2}\s*$/gm, '');
  // Stray punctuation-only lines
  text = text.replace(/^\s*[,\.\*\\\/\^\|]+\s*$/gm, '');

  // 7. Rejoin broken prose paragraphs.
  //    OCR of typeset books breaks every line at the printed column edge.
  //    Strategy: accumulate lines into paragraphs, treating blank lines as breaks.
  //    Headings (all-caps or starting with CHAPTER/PREFACE) stay on their own line.
  const isHeadingLine = (l) => {
    const t = l.trim();
    return (
      t.startsWith('CHAPTER') ||
      t.startsWith('PREFACE') ||
      t.startsWith('##') ||
      t.startsWith('#') ||
      (t === t.toUpperCase() && t.length > 2 && t.length < 60 && /[A-Z]/.test(t))
    );
  };

  const paragraphs = [];
  let buffer = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (buffer.length) {
        paragraphs.push(buffer.join(' '));
        buffer = [];
      }
      paragraphs.push('');
      continue;
    }

    if (isHeadingLine(trimmed)) {
      if (buffer.length) {
        paragraphs.push(buffer.join(' '));
        buffer = [];
      }
      paragraphs.push(trimmed);
      continue;
    }

    buffer.push(trimmed);
  }
  if (buffer.length) paragraphs.push(buffer.join(' '));

  text = paragraphs.join('\n');

  // 8. Format chapter headings as markdown
  //    "CHAPTER I." and its following summary line → "## Chapter I\n\n*summary*"
  text = text.replace(
    /^CHAPTER\s+([IVXLCDM]+)\.\s*\n+([^\n]+)/gm,
    (match, num, summary) => {
      const cleanSummary = summary.trim();
      return `## Chapter ${num}\n\n*${cleanSummary}*`;
    }
  );

  // Handle chapter headings with no summary line
  text = text.replace(/^CHAPTER\s+([IVXLCDM]+)\.\s*$/gm, '## Chapter $1');

  // Format BOOK and PART headings (for multi-book works)
  text = text.replace(/^BOOK\s+([IVXLCDM]+)\.?\s*$/gm, '## Book $1');
  text = text.replace(/^PART\s+([IVXLCDM]+)\.?\s*$/gm, '## Part $1');

  // Format PREFACE
  text = text.replace(/^PREFACE\.\s*$/gm, '## Preface');

  // 9. Clean up the title line and subtitle
  text = text.replace(
    /^ANSELM'S\s+PROSLOGIUM\s*\n+OR\s+DISCOURSE\s+ON\s+THE\s+EXISTENCE\s+OF\s+GOD/m,
    '# Proslogion\n\n*Or, Discourse on the Existence of God*'
  );
  // Also handle if they're on separate lines without the OR
  text = text.replace(/^ANSELM'S\s+PROSLOGIUM\s*$/m, '# Proslogion');
  text = text.replace(/^OR\s+DISCOURSE\s+ON\s+THE\s+EXISTENCE\s+OF\s+GOD\s*$/m, '*Or, Discourse on the Existence of God*');

  // 9.5 Strip orphaned footnote markers left behind by OCR (deterministic,
  //     silent — see footnote-strip.mjs). Runs before final whitespace cleanup
  //     so any double spaces left by an isolated marker get collapsed below.
  const footnotes = stripFootnoteMarkers(text, config);
  text = footnotes.text;

  // 10. Final cleanup
  text = text.replace(/ {2,}/g, ' ');
  text = text.split('\n').map(l => l.trimEnd()).join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return { text, issues, footnotesStripped: footnotes.count };
}

console.log('Cleaning OCR text...');
const { text: cleaned, issues, footnotesStripped } = cleanOcrText(extracted, config);
console.log(`  footnote markers stripped: ${footnotesStripped}`);

// ---------------------------------------------------------------------------
// Build frontmatter helper
// ---------------------------------------------------------------------------

function buildFrontmatter({ title, slug, collection, collectionOrder }) {
  return `---
title: "${title}"
slug: "${slug}"
author: "${config.author}"
genre: "${config.genre}"
themes: []  # TODO — confirm from controlled vocabulary
collection: "${collection || ''}"
collection_order: ${collectionOrder != null ? collectionOrder : ''}
source_attribution: "${config.sourceAttribution}"
provenance_notes: "${config.provenanceNotes}"
translation_notes: "${config.translationNotes || ''}"
ocr_quality: "medium"  # TODO — review and set to high/medium/low after editorial check
published: false
copyright_safe: true
---

<!-- EDITORIAL INTRO — write 2–4 sentences here explaining what this text is and why it matters. -->

`;
}

// ---------------------------------------------------------------------------
// Split into sections if config.splitBy is set ('book' or 'part')
// ---------------------------------------------------------------------------

function splitIntoSections(text, splitBy) {
  const headingRe = splitBy === 'part'
    ? /^## Part ([IVXLCDM]+)\s*$/gm
    : /^## Book ([IVXLCDM]+)\s*$/gm;

  const matches = [];
  let m;
  const re = new RegExp(headingRe.source, headingRe.flags);
  while ((m = re.exec(text)) !== null) {
    matches.push({ index: m.index, roman: m[1] });
  }
  if (matches.length === 0) return null;

  const preamble = text.slice(0, matches[0].index).trim();

  return matches.map((match, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    let body = text.slice(match.index, end).trim();
    if (i === 0 && preamble) body = preamble + '\n\n' + body;
    const label = splitBy === 'part' ? 'Part' : 'Book';
    return { roman: match.roman, label, body, order: i + 1 };
  });
}

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------

const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const sections = config.splitBy ? splitIntoSections(cleaned, config.splitBy) : null;

if (sections && sections.length > 1) {
  // Multi-section: write each as a separate file in output/{slug}/
  const sectionDir = path.join(outputDir, config.slug);
  fs.mkdirSync(sectionDir, { recursive: true });

  for (const section of sections) {
    const sectionTitle = `${config.title} — ${section.label} ${section.roman}`;
    const sectionSlug = `${config.slug}-${section.label.toLowerCase()}-${section.order}`;
    const fm = buildFrontmatter({
      title: sectionTitle,
      slug: sectionSlug,
      collection: config.slug,
      collectionOrder: section.order,
    });
    const filePath = path.join(sectionDir, `${sectionSlug}.md`);
    fs.writeFileSync(filePath, fm + section.body, 'utf8');
    console.log(`  ✓ ${sectionTitle}`);
  }
  console.log(`✓ Written ${sections.length} sections → ${sectionDir}`);
} else {
  // Single file: write flat output/{slug}.md
  const fm = buildFrontmatter({ title: config.title, slug: config.slug, collection: '', collectionOrder: null });
  const outputPath = path.join(outputDir, `${config.slug}.md`);
  fs.writeFileSync(outputPath, fm + cleaned, 'utf8');
  console.log(`✓ Written: ${outputPath}`);
}

const warnings = issues.filter(i => i.startsWith('WARNING'));
const corrections = issues.filter(i => !i.startsWith('WARNING'));

const reviewSummary = `# Review Summary: ${config.title}

**Generated:** ${new Date().toISOString().split('T')[0]}
**Source:** ${config.sourceFile}
**Config key:** ${configKey}
**Footnote markers stripped:** ${footnotesStripped} _(orphaned markers removed silently; see footnote-strip.mjs)_

---

## Manual corrections applied (${corrections.length})

${corrections.length > 0 ? corrections.map(c => `- ${c}`).join('\n') : '_None_'}

## Warnings — corrections not found in source (${warnings.length})

${warnings.length > 0 ? warnings.map(w => `- ${w}`).join('\n') : '_None_'}

---

## Editorial checklist

- [ ] Read through full text for remaining OCR errors
- [ ] Set \`ocr_quality\` to high / medium / low
- [ ] Write editorial intro (2–4 sentences)
- [ ] Confirm theme tags from controlled vocabulary
- [ ] Confirm genre
- [ ] Verify source attribution and translation notes
- [ ] Set \`published: true\` when ready

---

## Notes

${config.editorialNotes || '_No notes provided in config._'}
`;

// Write review summary alongside the output (in section dir if split, otherwise root output dir)
const reviewDir = (sections && sections.length > 1)
  ? path.join(outputDir, config.slug)
  : outputDir;
const reviewPath = path.join(reviewDir, `${config.slug}-review-summary.md`);
fs.writeFileSync(reviewPath, reviewSummary, 'utf8');
console.log(`✓ Written: ${reviewPath}`);
console.log('\nDone. Open the review summary before publishing.');
