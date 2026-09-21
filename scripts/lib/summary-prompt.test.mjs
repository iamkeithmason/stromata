/**
 * Unit tests for the pure (no-API) helpers in summary-prompt.mjs.
 *   node --test scripts/lib/summary-prompt.test.mjs
 *
 * These guard the behaviour the shared module was extracted to preserve: the
 * trim never ships a half-word, and the truncation detector agrees with it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  trimToLength,
  isTruncated,
  SUMMARY_MAX,
  SUMMARY_PROMPT,
  REVIEW_SUMMARY_GUIDANCE,
} from './summary-prompt.mjs';

test('leaves a summary that already fits untouched', () => {
  const s = 'A bishop instructs his clergy on the care of souls.';
  assert.equal(trimToLength(s, SUMMARY_MAX), s);
});

test('drops whole trailing sentences rather than cutting one', () => {
  const s = 'A bishop instructs his clergy. He turns then to the care of the sick. A third sentence follows.';
  const out = trimToLength(s, 60);
  assert.ok(out.length <= 60);
  assert.ok(out.endsWith('.'), 'must end on a sentence boundary');
  assert.ok(!out.includes('third'), 'the overflowing sentence should be gone entirely');
});

test('never splits a word when no whole sentence fits', () => {
  // The failure this guard exists for: "…assent to prop" shipped to production.
  const s = 'An extraordinarily long single unbroken sentence about ecclesiastical jurisdiction and the limits of conciliar authority in the Latin west.';
  const out = trimToLength(s, 40);
  assert.ok(out.length <= 40);
  // Whatever was cut, the result must end at a word boundary.
  assert.ok(/\S$/.test(out), 'must not end on whitespace');
  assert.ok(s.startsWith(out), 'must be a prefix of the original');
  assert.ok(s[out.length] === ' ' || out.length === s.length, 'must cut at a space, not mid-word');
});

test('handles empty and nullish input without throwing', () => {
  assert.equal(trimToLength('', 160), '');
  assert.equal(trimToLength(null, 160), '');
  assert.equal(trimToLength(undefined, 160), '');
});

test('isTruncated flags ellipses and missing terminal punctuation', () => {
  assert.equal(isTruncated('A complete sentence.'), false);
  assert.equal(isTruncated('A question?'), false);
  assert.equal(isTruncated('Cut off mid-thought…'), true);
  assert.equal(isTruncated('Cut off mid-thought...'), true);
  assert.equal(isTruncated('No terminal punctuation'), true);
});

test('isTruncated treats a missing summary as not-truncated, not as damaged', () => {
  // A null summary is "never written", which is a different backlog from
  // "written and cut short" — repair-summaries.mjs must not claim it.
  assert.equal(isTruncated(null), false);
  assert.equal(isTruncated(''), false);
});

test('the review brief narrows the house prompt rather than replacing it', () => {
  // If these ever diverge, the queue would be writing in a different register
  // from every other summary in the corpus.
  assert.ok(SUMMARY_PROMPT.includes('meta description'));
  assert.ok(REVIEW_SUMMARY_GUIDANCE.includes('110–140'));
  assert.ok(REVIEW_SUMMARY_GUIDANCE.includes('ONE sentence'));
  assert.ok(/This text/.test(REVIEW_SUMMARY_GUIDANCE), 'must ban the pointing opener');
});
