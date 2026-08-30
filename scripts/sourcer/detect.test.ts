/**
 * Tests for the detection pass — it FLAGS, it never corrects. Covers the pure
 * detectors (footnote orphans, garbled Greek, theological near-homographs) and
 * the deterministic OCR-quality estimate. No corpus / network needed.
 *
 * Run: npx tsx --test scripts/sourcer/detect.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectFootnoteOrphans,
  detectGreek,
  detectHomographs,
  estimateOcrQuality,
} from './detect';

test('detectFootnoteOrphans finds surviving superscript + bracketed markers', () => {
  const body = 'A clean line.\nA word with a marker¹ still glued.\nAnother [12] reference.\n';
  const orphans = detectFootnoteOrphans(body);
  assert.equal(orphans.length, 2);
  assert.equal(orphans[0].line, 2);
  assert.equal(orphans[1].marker, '[12]');
});

test('detectGreek flags a Greek run carrying a replacement character', () => {
  const body = 'Plain english line.\nτὸ � λόγος garbled here.\n';
  const flags = detectGreek(body);
  assert.equal(flags.length, 1);
  assert.match(flags[0].note, /replacement character/);
});

test('detectGreek flags Latin letters fused into a Greek word', () => {
  const flags = detectGreek('the word λogos mixed\n');
  assert.equal(flags.length, 1);
  assert.match(flags[0].note, /Latin letters/);
});

test('detectHomographs offers the alternative (never applies) with the stakes', () => {
  const body = 'The Son is ἀγέννητος according to some.\n';
  const h = detectHomographs(body);
  assert.equal(h.length, 1);
  assert.equal(h[0].word, 'ἀγέννητος');
  assert.deepEqual(h[0].alternatives, ['ἀγένητος']);
  assert.match(h[0].stakes, /Nicene|Arian/);
});

test('estimateOcrQuality bins by artefact density', () => {
  assert.equal(estimateOcrQuality(1, 0, 1000).quality, 'high'); // 0.001
  assert.equal(estimateOcrQuality(10, 0, 1000).quality, 'medium'); // 0.01
  assert.equal(estimateOcrQuality(50, 10, 1000).quality, 'low'); // 0.06
  assert.equal(estimateOcrQuality(0, 0, 0).quality, 'medium'); // empty → medium
});
