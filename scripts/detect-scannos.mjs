#!/usr/bin/env node

/**
 * detect-scannos.mjs — flag suspect (OCR-damaged) words. Corrects nothing on
 * its own; the editor promotes each flag, mirroring the note_draft → editorial
 * gate. This is the probabilistic half of OCR cleanup and is deliberately kept
 * separate from the deterministic footnote stripper (clean-archive-ocr.mjs):
 * one is safe to run unattended, this one is not.
 *
 * Signals combined (see design notes in the project prompt):
 *   A. Confusion-pair distance 1 from a corpus-common word → suggestion.
 *   B. Corpus rarity — a hapax is almost always OCR damage.
 *   C. Dictionary — skipped (no dependency available); A and B carry the work.
 * Capitalised words not at a sentence start are down-ranked (proper nouns).
 *
 * Workflow:
 *   node scripts/detect-scannos.mjs <path-or-slug> [--report=<path>] [--min-tier=N]
 *   node scripts/detect-scannos.mjs --apply-reviewed=<edited-report>
 *
 * The report is editable: change a row's ACTION to `fix` (apply the
 * replacement) or `allow` (add the word to scanno-allowlist.txt), optionally
 * editing the REPLACEMENT, then re-run with --apply-reviewed. Corrections are
 * written to source markdown only — never to the database.
 *
 * No dependencies — Node built-ins only.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { tokenize, wordKey, isPureNumber } from './lib/corpus-tokenize.mjs';
import { THRESHOLDS, directedPairs } from './scanno-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CORPUS_PATH = path.join(__dirname, '..', 'data', 'corpus-frequency.json');
export const ALLOWLIST_PATH = path.join(__dirname, 'scanno-allowlist.txt');
const OUTPUT_DIR = path.join(__dirname, 'ingestion', 'output');

// ---------------------------------------------------------------------------
// Loading helpers (used here and by pipeline-import.mjs)
// ---------------------------------------------------------------------------

export function loadCorpus() {
  if (!fs.existsSync(CORPUS_PATH)) return null;
  return JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));
}

export function loadAllowlist(allowlistPath = ALLOWLIST_PATH) {
  const set = new Set();
  if (!fs.existsSync(allowlistPath)) return set;
  for (const raw of fs.readFileSync(allowlistPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    set.add(line.toLowerCase());
  }
  return set;
}

// ---------------------------------------------------------------------------
// Detection core
// ---------------------------------------------------------------------------

function bestSuggestion(word, corpus, pairs, commonMin) {
  const selfKey = word.toLowerCase();
  const candidates = new Set();
  for (const [a, b] of pairs) {
    let idx = word.indexOf(a);
    while (idx !== -1) {
      candidates.add(word.slice(0, idx) + b + word.slice(idx + a.length));
      idx = word.indexOf(a, idx + 1);
    }
  }
  let best = null;
  for (const cand of candidates) {
    const key = cand.toLowerCase();
    if (key === selfKey) continue;
    const count = corpus.words?.[key]?.count ?? 0;
    if (count >= commonMin && (!best || count > best.count)) best = { word: cand, key, count };
  }
  return best;
}

function atSentenceStart(line, col) {
  const prefix = line.slice(0, col);
  if (prefix.trim() === '') return true; // start of a paragraph line
  if (/^#{1,6}\s+$/.test(prefix)) return true; // right after a heading marker
  return /[.!?][)\]"'’”]*\s+$/.test(prefix); // right after a sentence terminator
}

function contextAround(line, col, windowWords = 5) {
  const parts = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line)) !== null) parts.push({ t: m[0], i: m.index });
  let idx = parts.findIndex((p) => col >= p.i && col < p.i + p.t.length);
  if (idx === -1) idx = 0;
  const from = Math.max(0, idx - windowWords);
  const to = Math.min(parts.length, idx + windowWords + 1);
  let ctx = parts.slice(from, to).map((p) => p.t).join(' ');
  if (from > 0) ctx = '… ' + ctx;
  if (to < parts.length) ctx += ' …';
  return ctx.replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
}

/**
 * @param {string} text - markdown source
 * @param {object} opts
 * @param {object} opts.corpus - loaded corpus index { meta, words }
 * @param {Set<string>} [opts.allowlist] - lowercased confirmed-correct words
 * @param {string} [opts.slug]
 * @returns {Array<object>} flags
 */
export function detectScannos(text, opts = {}) {
  const { corpus, allowlist = new Set(), slug = '' } = opts;
  const thresholds = { ...THRESHOLDS, ...(opts.thresholds || {}) };
  const pairs = opts.pairs || directedPairs();
  if (!corpus || !corpus.words) return [];

  const lines = text.split('\n');
  const flags = [];

  for (const { word, line, col } of tokenize(text)) {
    if (isPureNumber(word)) continue;
    if (word.length < thresholds.minWordLength) continue;
    const key = wordKey(word);
    if (allowlist.has(key)) continue;

    const suspectCount = corpus.words[key]?.count ?? 0;
    // Primary gate: a word common in the corpus is correct, full stop — a real
    // OCR error would not recur hundreds of times. Skip before any suggestion
    // work so common words never reach even Tier 2.
    if (suspectCount > thresholds.suspectMaxFreq) continue;

    const suggestion = bestSuggestion(word, corpus, pairs, thresholds.commonMin);
    const isHapax = suspectCount <= thresholds.hapaxMax;
    const isRare = suspectCount <= thresholds.rareMax;
    const capitalised = /^\p{Lu}/u.test(word);
    const capMidSentence = capitalised && !atSentenceStart(lines[line - 1], col);

    let tier = null;
    if (suggestion) tier = isHapax && !capMidSentence ? 1 : 2;
    else if (isRare && !capMidSentence) tier = 3;
    if (tier === null) continue;

    flags.push({
      slug,
      line,
      col,
      word,
      suggestion: suggestion ? suggestion.word : '',
      tier,
      freq: suspectCount,
      context: contextAround(lines[line - 1], col),
    });
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Editable report — write / parse / apply
// ---------------------------------------------------------------------------

const REPORT_COLUMNS = '# ACTION | FILE | LINE | TIER | FREQ | SUSPECT | REPLACEMENT | CONTEXT';

export function formatReport(flags, { corpus, minTier }) {
  const shown = flags.filter((f) => f.tier <= minTier);
  const byTier = { 1: 0, 2: 0, 3: 0 };
  for (const f of shown) byTier[f.tier]++;

  const header = [
    `# Scanno review report — generated ${new Date().toISOString()}`,
    `# Corpus: ${corpus.meta.textCount} text(s), ${corpus.meta.totalTokens} tokens, ${corpus.meta.distinctWords} distinct words.`,
    `# Flags shown (min-tier ${minTier}): ${shown.length}  ·  Tier 1: ${byTier[1]}  Tier 2: ${byTier[2]}  Tier 3: ${byTier[3]}`,
    '#',
    '# TO REVIEW: change ACTION to one of:',
    '#   skip   — do nothing (default)',
    '#   fix    — replace SUSPECT with REPLACEMENT on that line of FILE',
    '#   allow  — add SUSPECT to scanno-allowlist.txt (never flagged again)',
    '# You may edit REPLACEMENT to substitute your own correction.',
    '# Then: node scripts/detect-scannos.mjs --apply-reviewed=<this file>',
    '#',
    REPORT_COLUMNS,
  ];

  const rows = shown
    .sort((a, b) => a.tier - b.tier || a.file.localeCompare(b.file) || a.line - b.line)
    .map((f) => `skip | ${f.file} | ${f.line} | ${f.tier} | ${f.freq} | ${f.word} | ${f.suggestion} | ${f.context}`);

  return header.concat(rows).join('\n') + '\n';
}

export function parseReport(content) {
  const fixes = [];
  const allows = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = raw.split(' | ');
    if (parts.length < 7) continue;
    const action = parts[0].trim().toLowerCase();
    const file = parts[1].trim();
    const lineNo = Number(parts[2].trim());
    const suspect = parts[5].trim();
    const replacement = (parts[6] || '').trim();
    if (action === 'fix') {
      if (replacement) fixes.push({ file, line: lineNo, suspect, replacement });
    } else if (action === 'allow') {
      allows.push(suspect);
    }
  }
  return { fixes, allows };
}

function isWordChar(c) {
  return c !== undefined && /[\p{L}\p{N}'’-]/u.test(c);
}

// Replace the nth (0-indexed) standalone occurrence of `suspect` on a line.
function replaceOccurrence(lineStr, suspect, replacement, nth) {
  let from = 0;
  let seen = 0;
  while (true) {
    const idx = lineStr.indexOf(suspect, from);
    if (idx === -1) return null;
    const boundary = !isWordChar(lineStr[idx - 1]) && !isWordChar(lineStr[idx + suspect.length]);
    if (boundary) {
      if (seen === nth) return lineStr.slice(0, idx) + replacement + lineStr.slice(idx + suspect.length);
      seen++;
    }
    from = idx + suspect.length;
  }
}

function appendAllowlist(words, allowlistPath = ALLOWLIST_PATH) {
  const existing = loadAllowlist(allowlistPath);
  const toAdd = [];
  for (const w of words) {
    if (!existing.has(w.toLowerCase()) && !toAdd.some((x) => x.toLowerCase() === w.toLowerCase())) toAdd.push(w);
  }
  if (toAdd.length === 0) return 0;
  let content = fs.existsSync(allowlistPath) ? fs.readFileSync(allowlistPath, 'utf8') : '';
  if (content && !content.endsWith('\n')) content += '\n';
  content += toAdd.join('\n') + '\n';
  fs.writeFileSync(allowlistPath, content, 'utf8');
  return toAdd.length;
}

export function applyReviewed(reportPath, { allowlistPath = ALLOWLIST_PATH } = {}) {
  const { fixes, allows } = parseReport(fs.readFileSync(reportPath, 'utf8'));

  // Group fixes by file, then apply per line with an occurrence counter so
  // repeated suspects on the same line each get consumed once.
  const byFile = new Map();
  for (const fix of fixes) {
    if (!byFile.has(fix.file)) byFile.set(fix.file, []);
    byFile.get(fix.file).push(fix);
  }

  let applied = 0;
  const missed = [];
  for (const [file, fileFixes] of byFile) {
    if (!fs.existsSync(file)) {
      for (const f of fileFixes) missed.push(`${file}:${f.line} ${f.suspect} (file not found)`);
      continue;
    }
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const nthByLine = new Map();
    for (const f of fileFixes.sort((a, b) => a.line - b.line)) {
      const li = f.line - 1;
      if (li < 0 || li >= lines.length) {
        missed.push(`${file}:${f.line} ${f.suspect} (line out of range)`);
        continue;
      }
      const nth = nthByLine.get(f.line) || 0;
      const replaced = replaceOccurrence(lines[li], f.suspect, f.replacement, nth);
      if (replaced === null) {
        missed.push(`${file}:${f.line} ${f.suspect} (not found on line)`);
        continue;
      }
      lines[li] = replaced;
      nthByLine.set(f.line, nth + 1);
      applied++;
    }
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
  }

  const allowed = appendAllowlist(allows, allowlistPath);
  return { applied, allowed, missed };
}

// ---------------------------------------------------------------------------
// Input resolution (filesystem only — path or output slug)
// ---------------------------------------------------------------------------

function collectMarkdown(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collectMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.endsWith('-review-summary.md')) found.push(full);
  }
  return found;
}

function resolveTarget(arg) {
  let files = [];
  if (fs.existsSync(arg)) {
    const stat = fs.statSync(arg);
    files = stat.isDirectory() ? collectMarkdown(arg) : [arg];
  } else {
    const flat = path.join(OUTPUT_DIR, `${arg}.md`);
    const dir = path.join(OUTPUT_DIR, arg);
    if (fs.existsSync(flat)) files = [flat];
    else if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) files = collectMarkdown(dir);
    else throw new Error(`No file or output slug matched "${arg}". Provide a markdown path.`);
  }
  return files.map((file) => ({
    file,
    slug: path.basename(file, '.md'),
    text: fs.readFileSync(file, 'utf8'),
  }));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  let target = null;
  let reportPath = null;
  let applyPath = null;
  let minTier = THRESHOLDS.defaultMinTier;

  for (const arg of argv) {
    if (arg.startsWith('--report=')) reportPath = arg.slice('--report='.length);
    else if (arg.startsWith('--apply-reviewed=')) applyPath = arg.slice('--apply-reviewed='.length);
    else if (arg.startsWith('--min-tier=')) minTier = Number(arg.slice('--min-tier='.length));
    else if (arg.startsWith('--')) console.warn(`Unknown option ignored: ${arg}`);
    else target = arg;
  }

  if (applyPath) {
    const { applied, allowed, missed } = applyReviewed(applyPath);
    console.log(`Applied ${applied} correction(s); added ${allowed} word(s) to the allowlist.`);
    if (missed.length) {
      console.warn(`  ! ${missed.length} could not be applied:`);
      for (const m of missed) console.warn(`      ${m}`);
    }
    return;
  }

  if (!target) {
    console.error('Usage: node scripts/detect-scannos.mjs <path-or-slug> [--report=<path>] [--min-tier=1|2|3]');
    console.error('       node scripts/detect-scannos.mjs --apply-reviewed=<edited-report>');
    process.exit(1);
  }

  const corpus = loadCorpus();
  if (!corpus) {
    console.error(`No corpus index at ${path.relative(process.cwd(), CORPUS_PATH)}.`);
    console.error('Build it first: node scripts/build-corpus-index.mjs');
    process.exit(1);
  }
  const allowlist = loadAllowlist();

  const inputs = resolveTarget(target);
  const flags = [];
  for (const { file, slug, text } of inputs) {
    for (const flag of detectScannos(text, { corpus, allowlist, slug })) flags.push({ ...flag, file });
  }

  const report = formatReport(flags, { corpus, minTier });
  if (reportPath) {
    fs.writeFileSync(reportPath, report, 'utf8');
    console.log(`Report written: ${reportPath}`);
    console.log(`${flags.filter((f) => f.tier <= minTier).length} flag(s) at min-tier ${minTier}.`);
  } else {
    process.stdout.write(report);
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
