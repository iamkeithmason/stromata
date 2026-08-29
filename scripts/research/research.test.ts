/**
 * Tests for the provenance assistant's pure parts — the SSRF guard, allowlist
 * status, the model-output coercion (defaults to HOLD, clamps fields), and the
 * report rendering. No network or API key needed.
 *
 * Run: npx tsx --test scripts/research/research.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateCandidateUrl, isSourcerPinnable } from './ssrf';
import { coerceAssessment } from './assess';
import { renderReport } from './report';
import type { ResearchResult } from './types';

test('SSRF guard allows public http(s) hosts', () => {
  assert.equal(validateCandidateUrl('https://www.newadvent.org/fathers/3304.htm').ok, true);
  assert.equal(validateCandidateUrl('http://example.com/x').ok, true);
});

test('SSRF guard blocks non-http(s), localhost, private + metadata IPs', () => {
  for (const bad of [
    'file:///etc/passwd',
    'ftp://example.com',
    'http://localhost/x',
    'http://127.0.0.1/x',
    'http://10.1.2.3/x',
    'http://192.168.0.1/x',
    'http://172.16.5.5/x',
    'http://169.254.169.254/latest/meta-data/',
    'http://foo.internal/x',
    'not-a-url',
  ]) {
    assert.equal(validateCandidateUrl(bad).ok, false, bad);
  }
});

test('isSourcerPinnable reflects the Sourcer allowlist', () => {
  assert.equal(isSourcerPinnable('https://www.newadvent.org/fathers/3304.htm'), true);
  assert.equal(isSourcerPinnable('https://archive.org/details/x'), true);
  assert.equal(isSourcerPinnable('https://biblehub.com/library/x'), false);
  assert.equal(isSourcerPinnable('https://onthewing.org/x'), false);
});

test('coerceAssessment defaults to HOLD unless the model explicitly said SAFE', () => {
  assert.equal(coerceAssessment({ verdict: 'nonsense' }).verdict, 'HOLD');
  assert.equal(coerceAssessment({}).verdict, 'HOLD');
  assert.equal(coerceAssessment({ verdict: 'safe' }).verdict, 'SAFE');
  assert.equal(coerceAssessment({ verdict: 'SAFE' }).verdict, 'SAFE');
});

test('coerceAssessment clamps confidence and normalises nullable fields', () => {
  const a = coerceAssessment({
    work: 'On the Orthodox Faith',
    author: 'John of Damascus',
    publicationYear: '1899',
    translator: '  ',
    confidence: 'bogus',
    verdict: 'SAFE',
    translationNotes: 'NPNF II.9 (1899) — public domain.',
  });
  assert.equal(a.publicationYear, 1899);
  assert.equal(a.translator, null); // whitespace → null
  assert.equal(a.confidence, 'low'); // unknown → low
});

function result(over: Partial<ResearchResult['assessment']> = {}, allowlisted = true): ResearchResult {
  return {
    url: 'https://www.newadvent.org/fathers/3304.htm',
    host: 'www.newadvent.org',
    allowlisted,
    fetchedBytes: 1234,
    assessment: coerceAssessment({
      work: 'An Exposition of the Orthodox Faith',
      author: 'John of Damascus',
      verdict: 'SAFE',
      confidence: 'high',
      reasoning: 'NPNF Second Series Vol. 9, published 1899 — pre-1929, public domain.',
      translationNotes: 'NPNF Second Series Vol. 9 (1899) — public domain (pre-1929).',
      ...over,
    }),
  };
}

test('renderReport shows the SAFE badge, allowlist status, and paste-ready notes', () => {
  const out = renderReport(result());
  assert.match(out, /✅ SAFE/);
  assert.match(out, /on the Sourcer allowlist/);
  assert.match(out, /Paste-ready Translation notes:/);
  assert.match(out, /public domain \(pre-1929\)/);
});

test('renderReport shows HOLD guidance and a copyright risk when present', () => {
  const out = renderReport(result({ verdict: 'HOLD', copyrightRisk: 'Chase, Fathers of the Church 37 (1958)' }, false));
  assert.match(out, /⛔ HOLD/);
  assert.match(out, /NOT on the Sourcer allowlist/);
  assert.match(out, /Chase, Fathers of the Church 37 \(1958\)/);
  assert.match(out, /Rights unclear/);
});
