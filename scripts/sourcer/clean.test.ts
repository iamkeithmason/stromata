/**
 * Tests for the deterministic character-level clean and the minimal HTML→text
 * pass. Every transform is a same-input-same-output rewrite. No probabilistic
 * change is made here. No network.
 *
 * Run: npx tsx --test scripts/sourcer/clean.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { htmlToText, looksLikeHtml, normalizeChars } from './clean';

test('normalizeChars expands ligatures deterministically', () => {
  assert.equal(normalizeChars('ﬁnal oﬀer ﬂour'), 'final offer flour');
});

test('normalizeChars folds doubled apostrophes into a double quote', () => {
  assert.equal(normalizeChars("he said ''hello''"), 'he said "hello"');
});

test('normalizeChars strips the soft hyphen and is idempotent', () => {
  const once = normalizeChars('sub­ject');
  assert.equal(once, 'subject');
  assert.equal(normalizeChars(once), once);
});

test('looksLikeHtml distinguishes markup from a djvu.txt scan', () => {
  assert.equal(looksLikeHtml('<html><body><p>hi</p></body></html>'), true);
  assert.equal(looksLikeHtml('CHAPTER I.\n\nPlain OCR text, no tags.'), false);
  assert.equal(looksLikeHtml('plain', 'text/html; charset=utf-8'), true);
});

test('htmlToText drops tags, keeps block boundaries, decodes entities', () => {
  const out = htmlToText('<h2>Title</h2><p>First &amp; only.</p><p>Second.</p>');
  assert.match(out, /## Title/);
  assert.match(out, /First & only\./);
  assert.match(out, /Second\./);
  assert.doesNotMatch(out, /<[^>]+>/);
});
