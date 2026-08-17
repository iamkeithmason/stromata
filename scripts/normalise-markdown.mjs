#!/usr/bin/env node

/**
 * normalise-markdown.mjs
 *
 * Deterministic Markdown block-boundary normaliser. Google Docs' Enter key
 * produces a single newline, which Markdown collapses to a space — so
 * consecutive paragraphs from a Doc merge into one on render. This script
 * inserts the blank lines that signal block boundaries, WITHOUT disturbing
 * lists, tables, code, blockquotes, or verse.
 *
 * No AI, no network, no dependencies — Node built-ins only. Pure transform:
 * same input always yields the same output. Running it twice is identical to
 * running it once (idempotent).
 *
 * Usage:
 *   node scripts/normalise-markdown.mjs <path-or-glob> [options]
 *
 *     --write          Apply changes. Without this flag the script is dry-run only.
 *     --report=<path>  Write the change report to a file instead of stdout.
 *     --verbose        Include a unified diff per changed file in the report.
 *
 * Dry-run is the default; --write is required to modify anything.
 *
 * Also importable as a module — normaliseMarkdown(text, opts) returns
 * { output, report } and never touches the filesystem.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

let CONFIG = { heuristics: { maxMedianLineLength: 60, terminalPunctuationRatio: 0.6 }, overrides: {} };
try {
  const loaded = (await import(path.join(__dirname, 'markdown-normalise-config.mjs'))).default;
  CONFIG = {
    heuristics: { ...CONFIG.heuristics, ...(loaded.heuristics || {}) },
    overrides: loaded.overrides || {},
  };
} catch {
  // Config is optional — fall back to the built-in defaults above.
}

// ---------------------------------------------------------------------------
// Line classifiers (all operate outside protected regions)
// ---------------------------------------------------------------------------

const isBlank = (l) => /^\s*$/.test(l);
const isAtxHeading = (l) => /^ {0,3}#{1,6}(?:\s|$)/.test(l);
const isThematicBreak = (l) => /^ {0,3}(?:([-*_])\s*){3,}$/.test(l) && /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(l);
const isListItem = (l) => /^ {0,3}(?:[-*+]|\d{1,9}[.)])\s+/.test(l);
const isBlockquote = (l) => /^ {0,3}>/.test(l);
const isFenceOpen = (l) => /^ {0,3}(`{3,}|~{3,})/.test(l);
// A line "contains a pipe" for table purposes if it has an unescaped `|`.
const hasUnescapedPipe = (l) => /(?:^|[^\\])\|/.test(l);
// GFM delimiter row: |---|:--:|---| etc. Requiring one avoids treating prose
// that merely contains a pipe as a table.
const isTableDelimiter = (l) => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(l);
// A deliberate hard break: two or more trailing spaces, or a trailing backslash.
const endsWithHardBreak = (l) => /(?: {2,}|\\)$/.test(l);

const isFrontmatterFence = (l) => /^---\s*$/.test(l);

// A line that begins some structural or protected construct — used to bound a
// plain-text run. Indented code is deliberately excluded here: it only starts
// after a blank line, which never occurs mid-run.
function startsSpecial(lines, i) {
  const l = lines[i];
  if (isFenceOpen(l)) return true;
  if (isAtxHeading(l)) return true;
  if (isThematicBreak(l)) return true;
  if (isListItem(l)) return true;
  if (isBlockquote(l)) return true;
  // Table: this line and the next both have pipes and the next is a delimiter row.
  if (hasUnescapedPipe(l) && i + 1 < lines.length && isTableDelimiter(lines[i + 1]) && hasUnescapedPipe(lines[i + 1])) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Verse detection — flag, never transform.
// ---------------------------------------------------------------------------

function isVerseRun(runLines, heuristics) {
  if (runLines.length < 3) return false;

  // Consistent leading indentation of 2+ spaces across every line reads as
  // set-out verse regardless of length/punctuation.
  if (runLines.every((l) => /^ {2,}\S/.test(l))) return true;

  const lengths = runLines.map((l) => l.trim().length).sort((a, b) => a - b);
  const mid = lengths.length >> 1;
  const median = lengths.length % 2 ? lengths[mid] : (lengths[mid - 1] + lengths[mid]) / 2;

  const terminal = /[.!?"'”’]$/;
  const terminalCount = runLines.filter((l) => terminal.test(l.trim())).length;
  const ratio = terminalCount / runLines.length;

  return median < heuristics.maxMedianLineLength && ratio < heuristics.terminalPunctuationRatio;
}

// ---------------------------------------------------------------------------
// Tokeniser — split the document into typed blocks plus the source blank-line
// gap that preceded each block. Protected blocks keep their text verbatim.
// ---------------------------------------------------------------------------

const STRUCTURAL = new Set(['heading', 'thematic-break', 'list', 'blockquote']);

function tokenize(input, opts) {
  const lines = input.split('\n');
  const n = lines.length;
  const blocks = [];
  const gaps = []; // gaps[k] = count of blank lines immediately before blocks[k]
  let pendingBlank = 0;
  let i = 0;

  const push = (block) => {
    blocks.push(block);
    gaps.push(pendingBlank);
    pendingBlank = 0;
  };

  // Front matter: only when the very first line is a `---` fence.
  if (n > 0 && isFrontmatterFence(lines[0])) {
    let j = 1;
    while (j < n && !isFrontmatterFence(lines[j])) j++;
    if (j < n) {
      push({ type: 'frontmatter', text: lines.slice(0, j + 1).join('\n') });
      i = j + 1;
    }
  }

  while (i < n) {
    const line = lines[i];

    if (isBlank(line)) {
      pendingBlank++;
      i++;
      continue;
    }

    // Fenced code block — consume through the matching closing fence (or EOF).
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1][0];
      const len = fence[1].length;
      const start = i;
      i++;
      while (i < n) {
        const closer = lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
        if (closer && closer[1][0] === marker && closer[1].length >= len) {
          i++;
          break;
        }
        i++;
      }
      push({ type: 'fenced-code', text: lines.slice(start, i).join('\n') });
      continue;
    }

    // Indented code block — 4+ spaces following a blank line (rule 3). Takes
    // precedence over verse for such runs.
    if (pendingBlank > 0 && /^ {4,}\S/.test(line)) {
      const start = i;
      while (i < n && /^ {4,}\S/.test(lines[i])) i++;
      push({ type: 'indented-code', text: lines.slice(start, i).join('\n') });
      continue;
    }

    if (isAtxHeading(line)) {
      push({ type: 'heading', text: line });
      i++;
      continue;
    }

    if (isThematicBreak(line)) {
      push({ type: 'thematic-break', text: line });
      i++;
      continue;
    }

    // List — starts on a list item, continues through further items and
    // indented continuation lines; a non-indented non-item line ends it.
    if (isListItem(line)) {
      const start = i;
      i++;
      while (i < n && !isBlank(lines[i]) && (isListItem(lines[i]) || /^\s+\S/.test(lines[i]))) i++;
      push({ type: 'list', text: lines.slice(start, i).join('\n') });
      continue;
    }

    // Blockquote — a run of `>` lines. A single internal blank line that is
    // itself wrapped by `>` lines is a paragraph break and becomes a `>`
    // separator (rule 5) rather than terminating the quote.
    if (isBlockquote(line)) {
      const qlines = [];
      let separated = 0;
      while (i < n) {
        if (isBlockquote(lines[i])) {
          qlines.push(lines[i]);
          i++;
        } else if (isBlank(lines[i]) && i + 1 < n && isBlockquote(lines[i + 1])) {
          qlines.push('>');
          separated++;
          i++;
        } else {
          break;
        }
      }
      push({ type: 'blockquote', text: qlines.join('\n'), separated });
      continue;
    }

    // Table — 2+ consecutive pipe lines with a delimiter row as the second line.
    if (hasUnescapedPipe(line) && i + 1 < n && isTableDelimiter(lines[i + 1]) && hasUnescapedPipe(lines[i + 1])) {
      const start = i;
      i += 2;
      while (i < n && !isBlank(lines[i]) && hasUnescapedPipe(lines[i])) i++;
      push({ type: 'table', text: lines.slice(start, i).join('\n') });
      continue;
    }

    // Plain text run — gather consecutive non-blank lines that don't begin a
    // structural/protected construct, then classify as verse or prose.
    const runStart = i;
    const runLines = [line];
    i++;
    while (i < n && !isBlank(lines[i]) && !startsSpecial(lines, i)) {
      runLines.push(lines[i]);
      i++;
    }

    const verse = opts.treatAllAsProse
      ? false
      : opts.treatAllAsVerse
        ? runLines.length >= 1
        : isVerseRun(runLines, opts.heuristics);

    if (verse) {
      push({
        type: 'verse',
        text: runLines.join('\n'),
        startLine: runStart + 1, // 1-indexed input line numbers
        endLine: runStart + runLines.length,
        preview: runLines[0].trim().slice(0, 80),
      });
      continue;
    }

    // Prose — split into paragraphs on every soft newline except after a
    // deliberate hard break. The first paragraph keeps the run's source gap;
    // the rest are adjacent (gap 0) and get a single inserted blank.
    const paragraphs = splitProse(runLines);
    for (let p = 0; p < paragraphs.length; p++) {
      if (p === 0) push({ type: 'prose', text: paragraphs[p] });
      else {
        blocks.push({ type: 'prose', text: paragraphs[p] });
        gaps.push(0);
      }
    }
  }

  return { blocks, gaps };
}

function splitProse(runLines) {
  const paragraphs = [];
  let current = [runLines[0]];
  for (let k = 1; k < runLines.length; k++) {
    if (endsWithHardBreak(runLines[k - 1])) current.push(runLines[k]);
    else {
      paragraphs.push(current.join('\n'));
      current = [runLines[k]];
    }
  }
  paragraphs.push(current.join('\n'));
  return paragraphs;
}

// ---------------------------------------------------------------------------
// Renderer — join blocks with resolved blank-line gaps.
// ---------------------------------------------------------------------------

// Resolve the number of blank lines to place between two adjacent blocks.
// Exactly one around any structural block; otherwise preserve the author's
// gap (a deliberate double space survives) but guarantee at least one and
// collapse runs of 3+ down to two.
function resolveGap(prev, next, sourceGap) {
  if (STRUCTURAL.has(prev.type) || STRUCTURAL.has(next.type)) return 1;
  if (sourceGap <= 0) return 1;
  if (sourceGap >= 3) return 2;
  return sourceGap;
}

function blockLines(block) {
  return block.text.split('\n');
}

function render(blocks, gaps, report) {
  if (blocks.length === 0) return '';

  const out = [];
  for (let k = 0; k < blocks.length; k++) {
    if (k > 0) {
      const prev = blocks[k - 1];
      const next = blocks[k];
      const desired = resolveGap(prev, next, gaps[k]);
      const inserted = Math.max(0, desired - gaps[k]);
      if (inserted > 0) {
        report.blanksInserted += inserted;
        if (prev.type === 'heading' || next.type === 'heading') report.headingsSpaced++;
        if (prev.type === 'list' || next.type === 'list') report.listsPadded++;
      }
      for (let g = 0; g < desired; g++) out.push('');
    }
    out.push(...blockLines(blocks[k]));
  }

  return out.join('\n') + '\n'; // exactly one trailing newline
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalise a Markdown string.
 * @param {string} input
 * @param {object} [options]
 * @param {object} [options.heuristics] - verse thresholds (defaults from config)
 * @param {object} [options.override]   - { treatAllAsVerse } | { treatAllAsProse }
 * @returns {{ output: string, report: object }}
 */
export function normaliseMarkdown(input, options = {}) {
  const heuristics = { ...CONFIG.heuristics, ...(options.heuristics || {}) };
  const override = options.override || {};

  const report = {
    blanksInserted: 0,
    headingsSpaced: 0,
    listsPadded: 0,
    blockquotesSeparated: 0,
    verseFlags: [],
    changed: false,
  };

  const normalisedInput = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const { blocks, gaps } = tokenize(normalisedInput, {
    heuristics,
    treatAllAsVerse: !!override.treatAllAsVerse,
    treatAllAsProse: !!override.treatAllAsProse,
  });

  for (const block of blocks) {
    if (block.type === 'blockquote') report.blockquotesSeparated += block.separated || 0;
    if (block.type === 'verse') {
      report.verseFlags.push({ startLine: block.startLine, endLine: block.endLine, preview: block.preview });
    }
  }

  const output = render(blocks, gaps, report);
  report.changed = output !== input;
  return { output, report };
}

/** Resolve the override entry for a file, keyed by basename without `.md`. */
export function overrideForFile(filePath) {
  const key = path.basename(filePath).replace(/\.md$/i, '');
  return CONFIG.overrides[key] || {};
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function collectFiles(target) {
  // Glob patterns → fs.globSync; a directory → recurse for .md; a file → itself.
  if (/[*?[\]{}]/.test(target)) {
    return fs.globSync(target).filter((f) => f.endsWith('.md') && fs.statSync(f).isFile());
  }
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    const found = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && entry.name.endsWith('.md')) found.push(full);
      }
    };
    walk(target);
    return found;
  }
  return target.endsWith('.md') ? [target] : [];
}

// Minimal line-level unified diff (LCS-based) — built-ins only, used for --verbose.
function unifiedDiff(before, after, filePath) {
  const a = before.split('\n');
  const b = after.split('\n');
  const m = a.length;
  const nn = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(nn + 1));
  for (let x = m - 1; x >= 0; x--) {
    for (let y = nn - 1; y >= 0; y--) {
      dp[x][y] = a[x] === b[y] ? dp[x + 1][y + 1] + 1 : Math.max(dp[x + 1][y], dp[x][y + 1]);
    }
  }
  const ops = [];
  let x = 0;
  let y = 0;
  while (x < m && y < nn) {
    if (a[x] === b[y]) {
      ops.push([' ', a[x]]);
      x++;
      y++;
    } else if (dp[x + 1][y] >= dp[x][y + 1]) {
      ops.push(['-', a[x++]]);
    } else {
      ops.push(['+', b[y++]]);
    }
  }
  while (x < m) ops.push(['-', a[x++]]);
  while (y < nn) ops.push(['+', b[y++]]);

  const lines = [`--- ${filePath}`, `+++ ${filePath} (normalised)`];
  for (const [sign, text] of ops) {
    if (sign === ' ') continue; // context-free: show only changed lines
    lines.push(`${sign}${text === '' ? '' : text}`);
  }
  return lines.join('\n');
}

function formatFileReport(filePath, report, { write, verbose, before, after }) {
  const lines = [];
  const verb = write ? 'changed' : 'would change';
  lines.push(`${report.changed ? '✎' : '·'} ${filePath}${report.changed ? ` — ${verb}` : ' — no change'}`);
  if (report.changed || report.verseFlags.length) {
    lines.push(
      `    blanks inserted: ${report.blanksInserted}  ·  headings spaced: ${report.headingsSpaced}` +
        `  ·  list runs padded: ${report.listsPadded}  ·  blockquote paras separated: ${report.blockquotesSeparated}`
    );
  }
  if (report.verseFlags.length) {
    lines.push(`    ⚠  VERSE FLAGGED — ${report.verseFlags.length} run(s), left untouched, review before publish:`);
    for (const f of report.verseFlags) {
      lines.push(`         lines ${f.startLine}–${f.endLine}: "${f.preview}"`);
    }
  }
  if (verbose && report.changed) {
    lines.push(unifiedDiff(before, after, filePath).split('\n').map((l) => `    ${l}`).join('\n'));
  }
  return lines.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const targets = [];
  let write = false;
  let verbose = false;
  let reportPath = null;

  for (const arg of argv) {
    if (arg === '--write') write = true;
    else if (arg === '--verbose') verbose = true;
    else if (arg.startsWith('--report=')) reportPath = arg.slice('--report='.length);
    else if (arg.startsWith('--')) console.warn(`Unknown option ignored: ${arg}`);
    else targets.push(arg);
  }

  if (targets.length === 0) {
    console.error('Usage: node scripts/normalise-markdown.mjs <path-or-glob> [--write] [--report=<path>] [--verbose]');
    process.exit(1);
  }

  const files = [...new Set(targets.flatMap(collectFiles))].sort();
  if (files.length === 0) {
    console.error('No .md files matched.');
    process.exit(1);
  }

  const totals = { files: files.length, changed: 0, blanks: 0, headings: 0, lists: 0, quotes: 0, verse: 0, verseFiles: 0 };
  const fileReports = [];

  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const { output, report } = normaliseMarkdown(before, { override: overrideForFile(file) });

    if (report.changed) {
      totals.changed++;
      if (write) fs.writeFileSync(file, output, 'utf8');
    }
    totals.blanks += report.blanksInserted;
    totals.headings += report.headingsSpaced;
    totals.lists += report.listsPadded;
    totals.quotes += report.blockquotesSeparated;
    totals.verse += report.verseFlags.length;
    if (report.verseFlags.length) totals.verseFiles++;

    fileReports.push(formatFileReport(file, report, { write, verbose, before, after: output }));
  }

  const header = write
    ? `Normalise Markdown — WRITE mode (${files.length} file(s))`
    : `Normalise Markdown — DRY RUN (no files modified; pass --write to apply) (${files.length} file(s))`;

  const totalsLine =
    `\nTOTALS: ${totals.changed}/${totals.files} file(s) ${write ? 'changed' : 'would change'}  ·  ` +
    `${totals.blanks} blank(s) inserted  ·  ${totals.headings} heading(s) spaced  ·  ` +
    `${totals.lists} list run(s) padded  ·  ${totals.quotes} blockquote para(s) separated  ·  ` +
    `${totals.verse} verse run(s) flagged across ${totals.verseFiles} file(s)`;

  const full = [header, '', ...fileReports, totalsLine].join('\n');

  if (reportPath) {
    fs.writeFileSync(reportPath, full + '\n', 'utf8');
    console.log(`Report written: ${reportPath}`);
    console.log(totalsLine.trim());
  } else {
    console.log(full);
  }
}

// Run as CLI only when invoked directly (not when imported).
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
