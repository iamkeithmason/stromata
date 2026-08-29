/**
 * Tests for the pure raw-assembly helper — a single pinned part is stored
 * untouched; multiple parts are concatenated IN ORDER with a provenance marker
 * per part. No network.
 *
 * Run: npx tsx --test scripts/sourcer/fetch.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assembleRawParts } from './fetch';

test('a single part is stored completely untouched (no markers)', () => {
  const raw = assembleRawParts([{ url: 'https://archive.org/x_djvu.txt', text: 'BOOK I.\n\nplain text' }]);
  assert.equal(raw, 'BOOK I.\n\nplain text');
});

test('multiple parts are concatenated in order with per-part markers', () => {
  const raw = assembleRawParts([
    { url: 'https://newadvent.org/1', text: 'first' },
    { url: 'https://newadvent.org/2', text: 'second' },
    { url: 'https://newadvent.org/3', text: 'third' },
  ]);
  assert.match(raw, /SOURCER PART 1\/3 · https:\/\/newadvent\.org\/1/);
  assert.match(raw, /SOURCER PART 3\/3 · https:\/\/newadvent\.org\/3/);
  // Order preserved: part 1 body before part 2 body before part 3 body.
  assert.ok(raw.indexOf('first') < raw.indexOf('second'));
  assert.ok(raw.indexOf('second') < raw.indexOf('third'));
});
