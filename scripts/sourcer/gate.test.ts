/**
 * Tests for the entry gate — the centre of the design. Each discriminated
 * refusal, the author-missing FLAG (not an abort), and idempotent re-runs
 * (already-staged). Runs with no SDK, Supabase, Notion, or API key.
 *
 * Run: npx tsx --test scripts/sourcer/gate.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { authorKey, dedupeKey } from './contract';
import { gateOne, runGate } from './gate';
import type { ClearedProspect, CorpusView } from './types';

function corpus(over: Partial<CorpusView> = {}): CorpusView {
  return {
    coveredWorks: new Set(),
    coveredSlugs: new Set(),
    authorsByKey: new Map(),
    totalTexts: 0,
    ...over,
  };
}

/** Corpus where Athanasius (d.373) is a known, pre-1900 author. */
function corpusWithAthanasius(): CorpusView {
  const c = corpus();
  c.authorsByKey.set(authorKey('Athanasius'), { name: 'Athanasius', deathYear: 373 });
  return c;
}

function prospect(over: Partial<ClearedProspect> = {}): ClearedProspect {
  return {
    id: 'p1',
    pageUrl: 'https://notion.so/p1',
    title: 'Athanasius — On the Incarnation',
    author: 'Athanasius',
    work: 'On the Incarnation',
    slug: 'on-the-incarnation-athanasius',
    tradition: 'Patristic',
    era: 'Nicene & Post-Nicene',
    genre: 'Treatise',
    status: 'Text available',
    clearedEditionUrl: 'https://archive.org/details/onincarnation00atha',
    additionalEditionUrls: [],
    rightsCleared: true,
    translationNotes: 'Trans. Robertson (NPNF II.4); published 1892, public domain.',
    referenceUrl: null,
    ...over,
  };
}

const OPTS = { repoRoot: '/repo', max: 10, isStaged: () => false };

test('a fully-cleared prospect with a known pre-1900 author PASSES', () => {
  const r = runGate([prospect()], corpusWithAthanasius(), OPTS);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].outcome, 'pass');
  assert.equal(r.skips.length, 0);
});

test('already-live when Notion Status is already "Live"', () => {
  const r = runGate([prospect({ status: 'Live' })], corpusWithAthanasius(), OPTS);
  assert.equal(r.accepted.length, 0);
  assert.equal(r.skips[0].reason, 'already-live');
});

test('already-live is case/whitespace-insensitive and checked before other gate failures', () => {
  const r = runGate([prospect({ status: ' live ', rightsCleared: false })], corpusWithAthanasius(), OPTS);
  assert.equal(r.skips[0].reason, 'already-live');
});

test('rights-not-cleared when the checkbox is not set', () => {
  const r = runGate([prospect({ rightsCleared: false })], corpusWithAthanasius(), OPTS);
  assert.equal(r.accepted.length, 0);
  assert.equal(r.skips[0].reason, 'rights-not-cleared');
});

test('no-cleared-edition when the pinned URL is empty (but rights checked)', () => {
  const r = runGate([prospect({ clearedEditionUrl: '' })], corpusWithAthanasius(), OPTS);
  assert.equal(r.skips[0].reason, 'no-cleared-edition');
});

test('source-not-allowlisted for a pinned edition off the allowlist', () => {
  const r = runGate([prospect({ clearedEditionUrl: 'https://onthewing.org/luther.htm' })], corpusWithAthanasius(), OPTS);
  assert.equal(r.skips[0].reason, 'source-not-allowlisted');
});

test('a multi-part edition with every part allowlisted PASSES', () => {
  const p = prospect({
    additionalEditionUrls: ['https://en.wikisource.org/wiki/Book_2', 'https://newadvent.org/x'],
  });
  const r = runGate([p], corpusWithAthanasius(), OPTS);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].outcome, 'pass');
});

test('source-not-allowlisted when an ADDITIONAL part is off the allowlist', () => {
  const p = prospect({ additionalEditionUrls: ['https://onthewing.org/book2'] });
  const r = runGate([p], corpusWithAthanasius(), OPTS);
  assert.equal(r.skips[0].reason, 'source-not-allowlisted');
  assert.match(r.skips[0].detail, /onthewing\.org/);
});

test('no-provenance-basis when Translation notes is empty', () => {
  const r = runGate([prospect({ translationNotes: '   ' })], corpusWithAthanasius(), OPTS);
  assert.equal(r.skips[0].reason, 'no-provenance-basis');
});

test('author-copyright-fail for a KNOWN author who died at/after 1900', () => {
  const c = corpus();
  c.authorsByKey.set(authorKey('C. S. Lewis'), { name: 'C. S. Lewis', deathYear: 1963 });
  const p = prospect({ author: 'C. S. Lewis', work: 'Mere Christianity', slug: 'mere-christianity-lewis', clearedEditionUrl: 'https://archive.org/details/x' });
  const r = runGate([p], c, OPTS);
  assert.equal(r.skips[0].reason, 'author-copyright-fail');
});

test('author-missing FLAGS the draft but does not abort (still staged)', () => {
  const r = runGate([prospect()], corpus(), OPTS); // empty corpus → author unknown
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].outcome, 'flagged');
  assert.equal(r.accepted[0].reason, 'author-missing');
  assert.match(r.accepted[0].flags[0], /author-missing/);
});

test('already-present when the work is in the corpus (dedupe key)', () => {
  const c = corpusWithAthanasius();
  c.coveredWorks.add(dedupeKey('Athanasius', 'On the Incarnation'));
  const r = runGate([prospect()], c, OPTS);
  assert.equal(r.skips[0].reason, 'already-present');
});

test('already-present when the slug is in the corpus', () => {
  const c = corpusWithAthanasius();
  c.coveredSlugs.add('on-the-incarnation-athanasius');
  const r = runGate([prospect()], c, OPTS);
  assert.equal(r.skips[0].reason, 'already-present');
});

test('already-staged (idempotent re-run) when a bundle already exists on disk', () => {
  const r = runGate([prospect()], corpusWithAthanasius(), { ...OPTS, isStaged: () => true });
  assert.equal(r.skips[0].reason, 'already-staged');
});

test('over-cap once the run cap is reached', () => {
  const staged = new Set<string>();
  const first = gateOne(prospect(), corpusWithAthanasius(), { repoRoot: '/r', max: 1, isStaged: () => false }, 0, staged);
  assert.equal(first.outcome, 'pass');
  staged.add(first.prospect.slug);
  const second = gateOne(
    prospect({ id: 'p2', title: 'Basil — On the Holy Spirit', author: 'Basil', work: 'On the Holy Spirit', slug: 'on-the-holy-spirit-basil', clearedEditionUrl: 'https://archive.org/details/y' }),
    corpusWithAthanasius(),
    { repoRoot: '/r', max: 1, isStaged: () => false },
    1,
    staged,
  );
  assert.equal(second.outcome, 'refused');
  assert.equal(second.reason, 'over-cap');
});

test('two prospects sharing a slug in one batch: the second is already-staged', () => {
  const p1 = prospect();
  const p2 = prospect({ id: 'p2', title: 'Athanasius — On the Incarnation (dup)' }); // same slug
  const r = runGate([p1, p2], corpusWithAthanasius(), OPTS);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.skips.at(-1)?.reason, 'already-staged');
});
