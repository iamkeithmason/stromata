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

import { normaliseMarkdown } from './normalise-markdown.mjs';

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
