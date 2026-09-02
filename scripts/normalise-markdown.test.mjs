/**
 * normalise-markdown.test.mjs
 *
 * Fixture-driven tests for the Markdown paragraph normaliser. Each case is an
 * input/expected pair under __fixtures__/normalise-markdown/. Every fixture is
 * additionally asserted idempotent: normalise(normalise(x)) === normalise(x).
 *
 * Run:  node --test scripts/normalise-markdown.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { normaliseMarkdown, rejoinSpuriousBreaks } from './normalise-markdown.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'normalise-markdown');

const inputs = fs
  .readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.input.md'))
  .sort();

assert.ok(inputs.length > 0, 'expected at least one fixture');

for (const inputFile of inputs) {
  const name = inputFile.replace(/\.input\.md$/, '');
  const expectedFile = `${name}.expected.md`;
  const input = fs.readFileSync(path.join(FIXTURE_DIR, inputFile), 'utf8');
  const expected = fs.readFileSync(path.join(FIXTURE_DIR, expectedFile), 'utf8');

  test(`${name}: transforms to expected output`, () => {
    const { output } = normaliseMarkdown(input);
    assert.equal(output, expected, `output mismatch for fixture "${name}"`);
  });

  test(`${name}: idempotent (running twice == running once)`, () => {
    const once = normaliseMarkdown(input).output;
    const twice = normaliseMarkdown(once).output;
    assert.equal(twice, once, `not idempotent for fixture "${name}"`);
  });
}

// --- Targeted assertions on report contents -------------------------------

test('byte-identical fixtures report no change', () => {
  for (const name of ['table', 'fenced-code', 'hymn-stanza']) {
    const input = fs.readFileSync(path.join(FIXTURE_DIR, `${name}.input.md`), 'utf8');
    const { output, report } = normaliseMarkdown(input);
    assert.equal(output, input, `${name} should be byte-identical`);
    assert.equal(report.changed, false, `${name} should report changed=false`);
  }
});

test('hymn stanza is flagged as one verse run', () => {
  const input = fs.readFileSync(path.join(FIXTURE_DIR, 'hymn-stanza.input.md'), 'utf8');
  const { report } = normaliseMarkdown(input);
  assert.equal(report.verseFlags.length, 1);
  assert.equal(report.verseFlags[0].startLine, 1);
  assert.equal(report.verseFlags[0].endLine, 4);
});

test('mixed fixture flags verse but still transforms the prose', () => {
  const input = fs.readFileSync(path.join(FIXTURE_DIR, 'mixed-prose-verse.input.md'), 'utf8');
  const { report } = normaliseMarkdown(input);
  assert.equal(report.verseFlags.length, 1);
  assert.ok(report.blanksInserted >= 1, 'prose should have gained a blank line');
  assert.equal(report.changed, true);
});

test('blockquote separator is counted, not a blank line', () => {
  const input = fs.readFileSync(path.join(FIXTURE_DIR, 'blockquote.input.md'), 'utf8');
  const { output, report } = normaliseMarkdown(input);
  assert.equal(report.blockquotesSeparated, 1);
  assert.ok(output.includes('\n>\n'), 'paragraphs should be joined by a > line');
  assert.ok(!/\n\n>/.test(output.replace(/^>.*\n/, '')), 'no blank line should split the quote');
});

test('treatAllAsVerse override protects prose from splitting', () => {
  const input = 'Line one of three.\nLine two of three.\nLine three of three.\n';
  const proseOut = normaliseMarkdown(input).output;
  assert.ok(proseOut.includes('\n\n'), 'default splits into paragraphs');

  const verseOut = normaliseMarkdown(input, { override: { treatAllAsVerse: true } });
  assert.equal(verseOut.output, input, 'treatAllAsVerse leaves the run untouched');
  assert.equal(verseOut.report.verseFlags.length, 1);
});

test('treatAllAsProse override suppresses verse flagging', () => {
  const input = fs.readFileSync(path.join(FIXTURE_DIR, 'hymn-stanza.input.md'), 'utf8');
  const { report } = normaliseMarkdown(input, { override: { treatAllAsProse: true } });
  assert.equal(report.verseFlags.length, 0, 'no verse flagged under treatAllAsProse');
});

// --- Mid-sentence page-break rejoin ---------------------------------------

test('rejoins a mid-sentence page-break split (the real Hus / De Ecclesia case)', () => {
  // Verbatim shape of the OCR artifact: a sentence cut at a printed page edge.
  const input =
    'and (4) by Matt. 5 : 20: "Whoso shall\n\n' +
    'break one of the least of these commandments and teach men so, shall be least in the kingdom of heaven."\n';
  const { output, report } = normaliseMarkdown(input);
  assert.equal(report.breaksJoined, 1);
  assert.ok(output.includes('"Whoso shall break one of the least'), 'the split should be healed with a single space');
  assert.ok(!/shall\n\nbreak/.test(output), 'no blank line should remain inside the sentence');
});

test('rejoins a mid-word page-break split', () => {
  // "essence o" / "flowing" — the page ended mid-word ("of").
  const input = 'these forces become part of the very essence o\n\nflowing into them from the soul.\n';
  const { output, report } = normaliseMarkdown(input);
  assert.equal(report.breaksJoined, 1);
  assert.ok(output.includes('essence o flowing into them'));
});

test('does NOT merge two genuine paragraphs', () => {
  // First ends with a full stop; second opens with a capital — a real boundary.
  const input = 'A complete first paragraph that ends properly.\n\nA second paragraph that begins with a capital.\n';
  const { output, report } = normaliseMarkdown(input);
  assert.equal(report.breaksJoined, 0);
  assert.ok(output.includes('.\n\nA second paragraph'), 'the blank-line boundary is preserved');
});

test('does NOT merge when the earlier paragraph ends mid-clause but the next starts with a capital', () => {
  // Unfinished-looking end, but a capitalised continuation is not a page-break split.
  const input = 'A line that trails off without a full stop\n\nProperly capitalised next paragraph here.\n';
  const { report } = normaliseMarkdown(input);
  assert.equal(report.breaksJoined, 0);
});

test('does NOT merge across a heading, list, or blockquote', () => {
  const acrossHeading = 'A trailing clause with no full stop\n\n## a lowercase heading\n\nmore text here.\n';
  assert.equal(normaliseMarkdown(acrossHeading).report.breaksJoined, 0);

  const acrossList = 'The steps that follow, in order\n\n- item one here\n- item two here\n';
  assert.equal(normaliseMarkdown(acrossList).report.breaksJoined, 0);
});

test('does NOT merge a list intro ending in a colon into the following prose', () => {
  // A colon is a legitimate paragraph-final mark; it must not read as a cut.
  const input = 'Consider the following point:\n\nand here the next paragraph continues lowercase.\n';
  assert.equal(normaliseMarkdown(input).report.breaksJoined, 0);
});

test('the noRejoin override disables page-break repair', () => {
  const input = 'a clause that trails off here\n\nlowercase continuation after the break.\n';
  assert.ok(normaliseMarkdown(input).report.breaksJoined >= 1, 'default rejoins');
  assert.equal(normaliseMarkdown(input, { override: { noRejoin: true } }).report.breaksJoined, 0);
});

test('rejoinSpuriousBreaks leaves a clean body byte-for-byte unchanged', () => {
  const clean = 'First paragraph, correctly separated.\n\nSecond paragraph, correctly separated.\n';
  const { output, joined } = rejoinSpuriousBreaks(clean);
  assert.equal(joined, 0);
  assert.equal(output, clean, 'no change means the exact original string is returned');
});

test('rejoinSpuriousBreaks heals splits without re-spacing the rest of the body', () => {
  // A deliberate section break (double blank) must survive the rejoin-only pass.
  const input =
    'a clause cut at the page edge\n\nlowercase continuation of that clause.\n\n\n' +
    'A separate section after a deliberate double blank.\n';
  const { output, joined } = rejoinSpuriousBreaks(input);
  assert.equal(joined, 1);
  assert.ok(output.includes('page edge lowercase continuation of that clause.'), 'the split is healed');
  assert.ok(output.includes('clause.\n\n\nA separate section'), 'the double-blank section break is preserved verbatim');
});

test('three or more blank lines collapse to two; a double stays double', () => {
  // Three blank lines (four newlines) between paragraphs collapse to two.
  const many = 'First paragraph of prose.\n\n\n\nSecond paragraph of prose.\n';
  assert.equal(
    normaliseMarkdown(many).output,
    'First paragraph of prose.\n\n\nSecond paragraph of prose.\n'
  );

  // A deliberate double blank (section break) is preserved as-is.
  const double = 'First paragraph of prose.\n\n\nSecond paragraph of prose.\n';
  assert.equal(normaliseMarkdown(double).output, double);
});
