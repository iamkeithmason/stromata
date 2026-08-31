#!/usr/bin/env node

/**
 * reformat-boethius-bodies.mjs
 *
 * One-off, deterministic, idempotent reformatter for the two Alfredian Boethius
 * texts that were imported before the pipeline gained automatic Markdown
 * normalisation:
 *
 *   - consolation-of-philosophy-alfred-prose.md  ("The Consolations of Boethius (Prose)")
 *   - consolation-of-philosophy-alfred-lays.md   ("The Lays of Boethius (Verse)")
 *
 * Both were staged with section markers as bare text lines (so they collapse
 * into the following paragraph on render) and — in the verse text — with every
 * line joined as one run-on block because Markdown treats a single newline as a
 * space.
 *
 * This script rewrites ONLY the Markdown body of each file, leaving the YAML
 * frontmatter byte-for-byte untouched. It does two things:
 *
 *   1. Promotes structural markers to `##` headings:
 *        prose — "Proem", "Boethius and Theodoric", the roman-numeral section
 *                numbers (I … XLII), and the closing "FINIT."
 *        verse — the "PRELUDE" line and every "N: Boethius. …" lay marker.
 *   2. Fixes line breaks:
 *        prose — real paragraph boundaries (via the shared normaliseMarkdown),
 *                so single-newline paragraphs no longer merge.
 *        verse — a Markdown hard break (trailing "\") on every line within a
 *                lay, so the poetry renders line-by-line instead of as prose.
 *
 * Running it twice produces the same output as running it once. No network, no
 * database — it only edits the local staged Markdown files. Pushing the result
 * into Supabase is a separate, explicit step (scripts/reformat-text-body.mjs).
 *
 * Usage:
 *   node scripts/ingestion/reformat-boethius-bodies.mjs            # dry run (report only)
 *   node scripts/ingestion/reformat-boethius-bodies.mjs --write    # apply to the files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normaliseMarkdown } from '../normalise-markdown.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output', 'consolation-of-philosophy-alfred');

const ROMAN = /^[IVXLCDM]+$/; // section number on its own line (prose)
const LAY_MARKER = /^[IVXLCDM]+:/; // "II: Boethius. I. Metr. 1." (verse)

// Split "---\n<frontmatter>\n---\n<body>" without disturbing the frontmatter.
function splitFrontmatter(raw) {
  const match = raw.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
  if (!match) throw new Error('No YAML frontmatter found');
  return { head: match[1], body: match[2] };
}

// ---------------------------------------------------------------------------
// Prose: promote markers to headings, then normalise paragraph boundaries.
// ---------------------------------------------------------------------------
function reformatProse(body) {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const promoted = lines.map((line) => {
    const l = line.replace(/\s+$/, '');
    if (l === 'Proem' || l === 'Boethius and Theodoric' || l === 'FINIT.') return `## ${l}`;
    if (ROMAN.test(l)) return `## ${l}`;
    return line;
  });
  // treatAllAsProse: these prose "meters" are set as running prose in this
  // edition, so never let the verse heuristic touch them — every soft newline
  // that isn't a heading is a paragraph boundary.
  const { output } = normaliseMarkdown(promoted.join('\n'), { override: { treatAllAsProse: true } });
  return output.trimEnd() + '\n';
}

// ---------------------------------------------------------------------------
// Verse: promote lay markers to headings; join each lay's lines with hard
// breaks so the poetry renders as lines, not prose.
// ---------------------------------------------------------------------------
function reformatVerse(body) {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let stanza = []; // verse lines of the current lay, awaiting flush

  const flush = () => {
    if (stanza.length === 0) return;
    // Each line but the last ends with a backslash hard break (CommonMark).
    out.push(stanza.join('\\\n'));
    stanza = [];
  };
  const emitHeading = (text) => {
    flush();
    if (out.length && out[out.length - 1] !== '') out.push('');
    out.push(`## ${text}`);
    out.push('');
  };

  for (const raw of lines) {
    const l = raw.replace(/\s+$/, '').replace(/\\$/, ''); // drop trailing ws + any prior hard break
    if (l === '') continue; // blank lines are structural only; rebuilt around headings
    if (l === 'LAYS') continue; // redundant divider (the title already says "The Lays")
    if (/^##\s+/.test(l)) { // already a heading (idempotent re-run)
      emitHeading(l.replace(/^##\s+/, ''));
      continue;
    }
    if (/^PRELUDE\b/.test(l)) {
      emitHeading(l.replace(/^PRELUDE/, 'Prelude'));
      continue;
    }
    if (LAY_MARKER.test(l)) {
      emitHeading(l.replace(/\.\s*$/, '')); // trim a trailing period on the citation
      continue;
    }
    stanza.push(l);
  }
  flush();

  // Collapse any accidental leading blank and guarantee a single trailing newline.
  return out.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

const FILES = [
  { name: 'consolation-of-philosophy-alfred-prose.md', fn: reformatProse },
  { name: 'consolation-of-philosophy-alfred-lays.md', fn: reformatVerse },
];

function main() {
  const write = process.argv.includes('--write');
  let anyChange = false;

  for (const { name, fn } of FILES) {
    const file = path.join(OUT_DIR, name);
    const raw = fs.readFileSync(file, 'utf8');
    const { head, body } = splitFrontmatter(raw);
    const newBody = fn(body);
    const next = head.endsWith('\n') ? head + newBody : head + '\n' + newBody;

    const changed = next !== raw;
    anyChange = anyChange || changed;

    const beforeHeadings = (body.match(/^##\s+/gm) || []).length;
    const afterHeadings = (newBody.match(/^##\s+/gm) || []).length;
    console.log(
      `${changed ? '✎' : '·'} ${name} — ${changed ? (write ? 'rewritten' : 'would change') : 'no change'} ` +
        `(headings ${beforeHeadings} → ${afterHeadings})`
    );

    if (changed && write) fs.writeFileSync(file, next, 'utf8');
  }

  if (!write) {
    console.log(anyChange ? '\nDRY RUN — pass --write to apply.' : '\nAlready normalised; nothing to do.');
  }
}

main();
