/**
 * Tests for the proposed-metadata validation — invalid genre dropped, themes
 * capped at 6 and filtered to the controlled vocabulary, collection shape
 * defaulted, and the `proposed:` framing rendered. Nothing is applied.
 *
 * Run: npx tsx --test scripts/sourcer/metadata.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateProposedMetadata, renderMetadataYaml } from './metadata';

const base = { slug: 'x', title: 'X — Y', author: 'X', ocrQuality: 'medium' as const, flags: [] };

test('an invalid genre is dropped to null', () => {
  const m = validateProposedMetadata({ genre: 'Blogpost' }, base);
  assert.equal(m.genre, null);
  assert.equal(validateProposedMetadata({ genre: 'Treatise' }, base).genre, 'Treatise');
});

test('themes are filtered to the vocabulary, deduped, and capped at 6', () => {
  const m = validateProposedMetadata(
    { themes: ['prayer', 'prayer', 'nonsense', 'humility', 'suffering', 'vice', 'virtue', 'death', 'justice'] },
    base,
  );
  assert.equal(m.themes.length, 6);
  assert.ok(!m.themes.includes('nonsense'));
  assert.equal(new Set(m.themes).size, m.themes.length); // deduped
});

test('collection defaults to single with no parts when unset', () => {
  const m = validateProposedMetadata({}, base);
  assert.equal(m.collection.shape, 'single');
  assert.equal(m.collection.parts.length, 0);
});

test('a single-shape proposal never carries parts', () => {
  const m = validateProposedMetadata({ collection: { shape: 'single', parts: [{ order: 1, title: 'I' }] } }, base);
  assert.equal(m.collection.parts.length, 0);
});

test('collection parts are kept and sorted for a collection shape', () => {
  const m = validateProposedMetadata(
    { collection: { shape: 'collection', rationale: 'numbered books', parts: [{ order: 2, title: 'Book II' }, { order: 1, title: 'Book I' }] } },
    base,
  );
  assert.equal(m.collection.shape, 'collection');
  assert.deepEqual(m.collection.parts.map((p) => p.title), ['Book I', 'Book II']);
});

test('renderMetadataYaml frames everything as proposed and omits tradition/era', () => {
  const y = renderMetadataYaml(validateProposedMetadata({ genre: 'Rule', themes: ['ministry'] }, base));
  assert.match(y, /proposed_genre: Rule/);
  assert.match(y, /proposed_themes:/);
  assert.match(y, /proposed_collection:/);
  assert.doesNotMatch(y, /tradition:/);
  assert.doesNotMatch(y, /^era:/m);
});
