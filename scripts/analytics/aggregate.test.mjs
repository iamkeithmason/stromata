/**
 * Tests for the analytics join/rollup logic. Run: node --test scripts/analytics/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigest, rank } from './aggregate.mjs';

// A small fixture corpus: two texts by one author, one by another.
function fixture() {
  const db = {
    textsBySlug: new Map([
      ['rule-of-life', { id: 't1', title: 'A Short Rule of Life', author_id: 'a1', genre_id: 'g1' }],
      ['prayers', { id: 't2', title: 'Prayers', author_id: 'a1', genre_id: 'g2' }],
      ['sermon-1', { id: 't3', title: 'Call to the Unconverted', author_id: 'a2', genre_id: 'g3' }],
    ]),
    authorsById: new Map([
      ['a1', { name: 'Jeremy Taylor', tradition_id: 'tr1', era_id: 'e1' }],
      ['a2', { name: 'Richard Baxter', tradition_id: 'tr1', era_id: 'e1' }],
    ]),
    traditionsById: new Map([['tr1', 'Anglican']]),
    erasById: new Map([['e1', 'Post-Reformation (1600–1800)']]),
    genresById: new Map([['g1', 'Rule'], ['g2', 'Prayer'], ['g3', 'Sermon']]),
    themesByTextId: new Map([
      ['t1', ['prayer', 'rule']],
      ['t2', ['prayer']],
      ['t3', ['repentance']],
    ]),
    collectionsBySlug: new Map([['pastoral-rule', { name: 'The Pastoral Rule' }]]),
  };
  return db;
}

test('rank sorts by value desc then label asc', () => {
  const m = new Map([['b', 2], ['a', 2], ['c', 5]]);
  assert.deepEqual(rank(m), [
    { label: 'c', value: 5 },
    { label: 'a', value: 2 },
    { label: 'b', value: 2 },
  ]);
  assert.equal(rank(m, 1).length, 1);
});

test('joins slugs to titles and authors', () => {
  const d = buildDigest({
    textOpens: [
      { slug: 'rule-of-life', count: 3 },
      { slug: 'prayers', count: 2 },
      { slug: 'sermon-1', count: 4 },
    ],
    db: fixture(),
  });
  const top = d.topTexts[0];
  assert.equal(top.slug, 'sermon-1');
  assert.equal(top.title, 'Call to the Unconverted');
  assert.equal(top.author, 'Richard Baxter');
  assert.equal(d.totals.distinctTextsOpened, 3);
});

test('rolls opens up by theme, weighted by each text’s open count', () => {
  const d = buildDigest({
    textOpens: [
      { slug: 'rule-of-life', count: 3 }, // themes prayer, rule
      { slug: 'prayers', count: 2 }, // theme prayer
      { slug: 'sermon-1', count: 4 }, // theme repentance
    ],
    db: fixture(),
  });
  const themes = Object.fromEntries(d.byTheme.map((r) => [r.label, r.value]));
  assert.equal(themes.prayer, 5); // 3 + 2
  assert.equal(themes.rule, 3);
  assert.equal(themes.repentance, 4);
  assert.equal(d.byTheme[0].label, 'prayer'); // highest
});

test('rolls up by author, era, tradition, genre', () => {
  const d = buildDigest({
    textOpens: [
      { slug: 'rule-of-life', count: 3 },
      { slug: 'prayers', count: 2 },
      { slug: 'sermon-1', count: 4 },
    ],
    db: fixture(),
  });
  assert.deepEqual(d.byAuthor, [
    { label: 'Jeremy Taylor', value: 5 },
    { label: 'Richard Baxter', value: 4 },
  ]);
  assert.deepEqual(d.byTradition, [{ label: 'Anglican', value: 9 }]);
  assert.deepEqual(d.byEra, [{ label: 'Post-Reformation (1600–1800)', value: 9 }]);
  assert.equal(d.byGenre.find((g) => g.label === 'Rule').value, 3);
});

test('flags slugs opened but not in the database', () => {
  const d = buildDigest({
    textOpens: [
      { slug: 'rule-of-life', count: 3 },
      { slug: 'deleted-text', count: 5 },
    ],
    db: fixture(),
  });
  assert.deepEqual(d.unmatchedTexts, [{ slug: 'deleted-text', count: 5 }]);
  assert.equal(d.totals.matchedOpens, 3);
  assert.equal(d.totals.unmatchedOpens, 5);
  assert.equal(d.totals.totalTextOpens, 8);
});

test('maps from-attribution and collections', () => {
  const d = buildDigest({
    textOpens: [{ slug: 'rule-of-life', count: 1 }],
    collectionOpens: [
      { slug: 'pastoral-rule', count: 2 },
      { slug: 'gone', count: 1 },
    ],
    fromAttribution: [
      { surface: 'homepage-grid', count: 7 },
      { surface: 'author-page', count: 9 },
    ],
    db: fixture(),
  });
  assert.equal(d.fromAttribution[0].label, 'author-page'); // sorted desc
  assert.deepEqual(d.collections, [{ slug: 'pastoral-rule', count: 2, name: 'The Pastoral Rule' }]);
  assert.deepEqual(d.unmatchedCollections, [{ slug: 'gone', count: 1 }]);
});

test('empty input produces empty rollups, not errors', () => {
  const d = buildDigest({ db: fixture() });
  assert.deepEqual(d.topTexts, []);
  assert.deepEqual(d.byTheme, []);
  assert.equal(d.totals.totalTextOpens, 0);
});
