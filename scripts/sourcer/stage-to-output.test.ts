/**
 * Tests for the staging→output bridge's split — it divides the Sourcer's clean
 * body.md at its `# … (Book N)` headings into ordered parts, keeping each book's
 * chapter content. No network.
 *
 * Run: npx tsx --test scripts/sourcer/stage-to-output.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { splitByBook, slugify } from './stage-to-output.mjs';

const BODY = [
  '# An Exposition of the Orthodox Faith (Book I)',
  '',
  '## Chapter 1. That the Deity is incomprehensible.',
  'No one has seen God at any time.',
  '',
  '# An Exposition of the Orthodox Faith (Book II)',
  '',
  '## Chapter 1. Concerning aeon or age.',
  'He created the ages Who Himself was before the ages.',
  '',
  '# An Exposition of the Orthodox Faith (Book III)',
  '',
  '## Chapter 1. Concerning the Incarnation.',
  'God the Word was made flesh.',
].join('\n');

test('splitByBook divides at Book headings, in order, keeping chapter bodies', () => {
  const parts = splitByBook(BODY);
  assert.equal(parts.length, 3);
  assert.deepEqual(
    parts.map((p: { title: string }) => p.title),
    [
      'An Exposition of the Orthodox Faith (Book I)',
      'An Exposition of the Orthodox Faith (Book II)',
      'An Exposition of the Orthodox Faith (Book III)',
    ],
  );
  assert.match(parts[0].body, /## Chapter 1\. That the Deity is incomprehensible\./);
  assert.match(parts[0].body, /No one has seen God/);
  // Book I's body must not bleed into Book II.
  assert.equal(parts[0].body.includes('He created the ages'), false);
  assert.match(parts[2].body, /God the Word was made flesh\./);
});

test('splitByBook returns [] when there are no Book headings', () => {
  assert.deepEqual(splitByBook('## Chapter 1.\n\nPlain text, no book dividers.'), []);
});

test('slugify makes a safe file segment', () => {
  assert.equal(slugify('An Exposition of the Orthodox Faith (Book I)'), 'an-exposition-of-the-orthodox-faith-book-i');
});
