/**
 * Tests for the deterministic character-level clean and the minimal HTML→text
 * pass. Every transform is a same-input-same-output rewrite. No probabilistic
 * change is made here. No network.
 *
 * Run: npx tsx --test scripts/sourcer/clean.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { htmlToText, looksLikeHtml, normalizeChars, stripNewAdventChrome } from './clean';

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

test('stripNewAdventChrome removes page chrome, keeps body + book/chapter headings', () => {
  const input = [
    'CHURCH FATHERS: An Exposition of the Orthodox Faith, Book I (John of Damascus)',
    '  Search:',
    '  Submit Search',
    '    Home   Encyclopedia   Summa   Fathers   Bible   Library',
    '  A  B  C  D  E  F  G  H  I  J  K  L  M  N  O  P  Q  R  S  T  U  V  W  X  Y  Z',
    'Home > Fathers of the Church > An Exposition of the Orthodox Faith (John of Damascus) > Book I',
    '# An Exposition of the Orthodox Faith (Book I)',
    'Please help support the mission of New Advent and get the full contents … all for only $19.99...',
    '## Chapter 1. That the Deity is incomprehensible.',
    'No one has seen God at any time; the Only-begotten Son has declared Him.',
    '## About this page',
    ' Source. Translated by E.W. Watson and L. Pullan. … Revised and edited for New Advent by Kevin Knight.',
    ' Contact information. The editor of New Advent is Kevin Knight.',
    'Copyright © 2026 by New Advent LLC. Dedicated to the Immaculate Heart of Mary.',
    'CONTACT US  | ADVERTISE WITH NEW ADVENT',
  ].join('\n');
  const { text, removed } = stripNewAdventChrome(input);
  assert.ok(removed >= 12);
  // Body + the book/chapter headings survive.
  assert.match(text, /# An Exposition of the Orthodox Faith \(Book I\)/);
  assert.match(text, /## Chapter 1\. That the Deity is incomprehensible\./);
  assert.match(text, /No one has seen God at any time/);
  // Every chrome fragment is gone.
  for (const gone of ['CHURCH FATHERS:', 'Submit Search', '$19.99', 'About this page', 'New Advent LLC', 'ADVERTISE WITH NEW ADVENT', 'Fathers of the Church >']) {
    assert.equal(text.includes(gone), false, gone);
  }
});

test('stripNewAdventChrome is a no-op on non-New-Advent text', () => {
  const plain = '## Chapter 1.\n\nPlain patristic prose with no site chrome.\n';
  const { text, removed } = stripNewAdventChrome(plain);
  assert.equal(removed, 0);
  assert.equal(text, plain);
});

test('htmlToText drops tags, keeps block boundaries, decodes entities', () => {
  const out = htmlToText('<h2>Title</h2><p>First &amp; only.</p><p>Second.</p>');
  assert.match(out, /## Title/);
  assert.match(out, /First & only\./);
  assert.match(out, /Second\./);
  assert.doesNotMatch(out, /<[^>]+>/);
});
