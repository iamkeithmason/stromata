/**
 * scannos.test.mjs — footnote stripping (deterministic) and scanno detection
 * (probabilistic) tests.
 *
 * Run:  node --test scripts/scannos.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { stripFootnoteMarkers } from './ingestion/footnote-strip.mjs';
import { detectScannos, formatReport, applyReviewed, loadAllowlist } from './detect-scannos.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '__fixtures__', 'scannos');

// ===========================================================================
// Task 1 — footnote marker stripping
// ===========================================================================

test('marker abutting a word, and before punctuation, are stripped', () => {
  assert.equal(stripFootnoteMarkers('the true faith^ endures').text, 'the true faith endures');
  assert.equal(stripFootnoteMarkers('he kept the faith^, and finished').text, 'he kept the faith, and finished');
  assert.equal(stripFootnoteMarkers('a dagger† and a double‡ here').text, 'a dagger and a double here');
});

test('markdown emphasis is never touched', () => {
  assert.equal(stripFootnoteMarkers('this is *emphasis* text').text, 'this is *emphasis* text');
  assert.equal(stripFootnoteMarkers('this is _underscored_ text').text, 'this is _underscored_ text');
  // but a lone, unpaired asterisk marker on a word is stripped
  assert.equal(stripFootnoteMarkers('God* is love').text, 'God is love');
});

test('well-formed markdown footnotes [^1] are left alone', () => {
  assert.equal(stripFootnoteMarkers('see the note[^1] here').text, 'see the note[^1] here');
  assert.equal(stripFootnoteMarkers('two[^intro] refs[^2] kept').text, 'two[^intro] refs[^2] kept');
});

test('numeric references are protected; orphan superscript digits are stripped', () => {
  assert.equal(stripFootnoteMarkers('Psalm 119 and 1 Corinthians 13, Chapter 3').text, 'Psalm 119 and 1 Corinthians 13, Chapter 3');
  assert.equal(stripFootnoteMarkers('compressed John3:16 and Psalm119 stay').text, 'compressed John3:16 and Psalm119 stay');
  assert.equal(stripFootnoteMarkers('the Spirit3 and the water').text, 'the Spirit and the water');
});

test('markers inside code blocks and tables are untouched (fixture)', () => {
  const input = fs.readFileSync(path.join(FIXTURES, 'footnote-code-table.input.md'), 'utf8');
  const expected = fs.readFileSync(path.join(FIXTURES, 'footnote-code-table.expected.md'), 'utf8');
  assert.equal(stripFootnoteMarkers(input).text, expected);
});

test('the toggle disables stripping entirely', () => {
  const input = 'the true faith^ endures';
  assert.equal(stripFootnoteMarkers(input, { stripFootnoteMarkers: false }).text, input);
});

// ===========================================================================
// Task 3 — scanno detection
// ===========================================================================

// A small synthetic corpus. detectScannos only reads `.words[key].count`.
const CORPUS = {
  meta: { textCount: 10, totalTokens: 50000, distinctWords: 3000 },
  words: {
    invisible: { count: 140, texts: 9 },
    grace: { count: 500, texts: 10 },
    abounds: { count: 40, texts: 8 },
    every: { count: 900, texts: 10 },
    place: { count: 600, texts: 10 },
    shew: { count: 200, texts: 8 },
    communion: { count: 80, texts: 7 },
    faith: { count: 800, texts: 10 },
  },
};

test('InvisibUe → Tier 1 with suggestion "invisible"', () => {
  const flags = detectScannos('InvisibUe grace abounds in every place.', { corpus: CORPUS, slug: 'x' });
  const hit = flags.find((f) => f.word === 'InvisibUe');
  assert.ok(hit, 'InvisibUe should be flagged');
  assert.equal(hit.tier, 1);
  assert.equal(hit.suggestion.toLowerCase(), 'invisible');
});

test('shew (200 occurrences) is not flagged', () => {
  const flags = detectScannos('And he did shew them the way.', { corpus: CORPUS, slug: 'x' });
  assert.equal(flags.filter((f) => f.word.toLowerCase() === 'shew').length, 0);
});

test('an allowlisted word is never flagged, even when it would be Tier 1', () => {
  const text = 'They shared cornmunion daily.';
  const without = detectScannos(text, { corpus: CORPUS, slug: 'x' });
  assert.equal(
    without.find((f) => f.word === 'cornmunion')?.tier,
    1,
    'cornmunion should be Tier 1 without the allowlist'
  );

  const withAllow = detectScannos(text, { corpus: CORPUS, allowlist: new Set(['cornmunion']), slug: 'x' });
  assert.equal(withAllow.filter((f) => f.word === 'cornmunion').length, 0);
});

test('a capitalised rare proper noun mid-sentence is down-ranked below Tier 1', () => {
  const flags = detectScannos('He joined the Zwinglian party in Zurich.', { corpus: CORPUS, slug: 'x' });
  const tier1 = flags.filter((f) => f.word === 'Zwinglian' && f.tier === 1);
  assert.equal(tier1.length, 0);
});

// ---------------------------------------------------------------------------
// --apply-reviewed round trip: report → edit → apply
// ---------------------------------------------------------------------------

test('apply-reviewed applies exactly the accepted corrections and no others', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanno-'));
  const src = path.join(dir, 'sample.md');
  const reportPath = path.join(dir, 'report.txt');
  const allowPath = path.join(dir, 'allow.txt');

  const original = 'InvisibUe grace abounds here.\nThe rare qwyxil sits on this line.\n';
  fs.writeFileSync(src, original);

  const corpus = {
    meta: { textCount: 5, totalTokens: 9000, distinctWords: 800 },
    words: {
      invisible: { count: 140 }, grace: { count: 200 }, abounds: { count: 60 },
      here: { count: 400 }, rare: { count: 120 }, sits: { count: 50 }, line: { count: 300 },
    },
  };

  const flags = detectScannos(fs.readFileSync(src, 'utf8'), { corpus, slug: 'sample' }).map((f) => ({ ...f, file: src }));
  const report = formatReport(flags, { corpus, minTier: 3 });

  // Editor edits: accept the InvisibUe fix, allowlist qwyxil, leave the rest.
  const edited = report
    .split('\n')
    .map((line) => {
      if (line.includes(' | InvisibUe | ')) return line.replace(/^skip /, 'fix ');
      if (line.includes(' | qwyxil | ')) return line.replace(/^skip /, 'allow ');
      return line;
    })
    .join('\n');
  fs.writeFileSync(reportPath, edited);

  const result = applyReviewed(reportPath, { allowlistPath: allowPath });

  assert.equal(result.applied, 1, 'exactly one correction applied');
  assert.equal(result.allowed, 1, 'exactly one word allowlisted');
  assert.equal(
    fs.readFileSync(src, 'utf8'),
    'Invisible grace abounds here.\nThe rare qwyxil sits on this line.\n',
    'only InvisibUe→Invisible changed; qwyxil untouched'
  );
  assert.ok(loadAllowlist(allowPath).has('qwyxil'), 'qwyxil added to the allowlist');

  fs.rmSync(dir, { recursive: true, force: true });
});
