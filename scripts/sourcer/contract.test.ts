/**
 * Tests for the structural contract: the source allowlist + fetch-URL resolution
 * (the copyright boundary by construction), djvu preference, staging-path
 * confinement, slug/dedupe, and clearance-record extraction. No network.
 *
 * Run: npx tsx --test scripts/sourcer/contract.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  allowlistedDomain,
  dedupeKey,
  extractClearanceRecord,
  isAllowlistedHost,
  isWithinStaging,
  pinnedUrls,
  preferCcelCacheTxt,
  preferDjvuTxt,
  resolveAllowlistedFetchUrl,
  resolveAllowlistedFetchUrls,
  slugFor,
} from './contract';
import type { ClearedProspect } from './types';

function prospect(over: Partial<ClearedProspect> = {}): ClearedProspect {
  return {
    id: 'p1', pageUrl: '', title: 'Gregory the Great — Book of Pastoral Rule', author: 'Gregory the Great',
    work: 'Book of Pastoral Rule', slug: 'book-of-pastoral-rule-great', tradition: null, era: null, genre: null,
    status: 'Text available', clearedEditionUrl: 'https://archive.org/details/pastoralrule', additionalEditionUrls: [], rightsCleared: true,
    translationNotes: 'Translated by James Barmby (NPNF II.12); published 1895, public domain.', referenceUrl: null,
    ...over,
  };
}

test('allowlist accepts the sanctioned hosts and their subdomains', () => {
  for (const h of ['archive.org', 'anglicanhistory.org', 'sacred-texts.com', 'en.wikisource.org', 'www.newadvent.org', 'ccel.org']) {
    assert.equal(isAllowlistedHost(h), true, h);
  }
});

test('allowlist rejects everything else (incl. known risk sources)', () => {
  for (const h of ['onthewing.org', 'biblehub.com', 'example.com', 'localhost', '169.254.169.254', 'archive.org.evil.com']) {
    assert.equal(isAllowlistedHost(h), false, h);
  }
});

test('allowlistedDomain maps a subdomain back to its registrable domain', () => {
  assert.equal(allowlistedDomain('en.wikisource.org'), 'wikisource.org');
  assert.equal(allowlistedDomain('archive.org'), 'archive.org');
});

test('preferDjvuTxt rewrites an Archive.org details/stream URL to _djvu.txt (idempotent)', () => {
  const out = preferDjvuTxt('https://archive.org/details/pastoralrule00greg');
  assert.equal(out, 'https://archive.org/stream/pastoralrule00greg/pastoralrule00greg_djvu.txt');
  assert.equal(preferDjvuTxt(out), out); // idempotent
  // Non-archive URLs pass through untouched.
  assert.equal(preferDjvuTxt('https://en.wikisource.org/wiki/Foo'), 'https://en.wikisource.org/wiki/Foo');
});

test('preferCcelCacheTxt handles the no-letter reading form (letter derived from author)', () => {
  // The natural CCEL reading URLs have NO letter segment — the letter is the
  // author's first character. (Real examples.)
  assert.equal(
    preferCcelCacheTxt('https://ccel.org/ccel/anselm/basic_works/basic_works'),
    'https://ccel.org/ccel/a/anselm/basic_works/cache/basic_works.txt',
  );
  assert.equal(
    preferCcelCacheTxt('https://ccel.org/ccel/ignatius/exercises/exercises'),
    'https://ccel.org/ccel/i/ignatius/exercises/cache/exercises.txt',
  );
  assert.equal(
    preferCcelCacheTxt('https://ccel.org/ccel/benedict/rule/rule'),
    'https://ccel.org/ccel/b/benedict/rule/cache/rule.txt',
  );
});

test('preferCcelCacheTxt also handles the storage form (letter present) + is idempotent', () => {
  const out = preferCcelCacheTxt('https://ccel.org/ccel/a/anselm/basic_works/basic_works.i.html');
  assert.equal(out, 'https://ccel.org/ccel/a/anselm/basic_works/cache/basic_works.txt');
  assert.equal(preferCcelCacheTxt('https://ccel.org/ccel/a/anselm/basic_works/'), out);
  // Already a .txt (and non-CCEL) pass through untouched.
  assert.equal(preferCcelCacheTxt(out), out);
  assert.equal(preferCcelCacheTxt('https://archive.org/details/x'), 'https://archive.org/details/x');
});

test('a pinned CCEL reading URL resolves to the fetchable cache .txt', () => {
  const p = prospect({ clearedEditionUrl: 'https://ccel.org/ccel/anselm/basic_works/basic_works' });
  assert.equal(resolveAllowlistedFetchUrl(p), 'https://ccel.org/ccel/a/anselm/basic_works/cache/basic_works.txt');
});

test('resolveAllowlistedFetchUrl returns the pinned edition ONLY, or null off-allowlist', () => {
  assert.ok(resolveAllowlistedFetchUrl(prospect())?.endsWith('_djvu.txt'));
  assert.equal(resolveAllowlistedFetchUrl(prospect({ clearedEditionUrl: 'https://onthewing.org/x' })), null);
  assert.equal(resolveAllowlistedFetchUrl(prospect({ clearedEditionUrl: '' })), null);
  assert.equal(resolveAllowlistedFetchUrl(prospect({ clearedEditionUrl: 'not a url' })), null);
});

test('pinnedUrls returns primary + additional in order, de-duped', () => {
  const p = prospect({
    clearedEditionUrl: 'https://archive.org/details/a',
    additionalEditionUrls: ['https://archive.org/details/b', 'https://archive.org/details/a'],
  });
  assert.deepEqual(pinnedUrls(p), ['https://archive.org/details/a', 'https://archive.org/details/b']);
});

test('resolveAllowlistedFetchUrls resolves ALL parts (djvu-preferred), in order', () => {
  const p = prospect({
    clearedEditionUrl: 'https://archive.org/details/book1',
    additionalEditionUrls: ['https://en.wikisource.org/wiki/Book_2'],
  });
  const out = resolveAllowlistedFetchUrls(p);
  assert.ok(out);
  assert.equal(out!.length, 2);
  assert.ok(out![0].endsWith('_djvu.txt'));
  assert.equal(out![1], 'https://en.wikisource.org/wiki/Book_2');
});

test('resolveAllowlistedFetchUrls is all-or-nothing: one off-allowlist part → null', () => {
  const p = prospect({
    clearedEditionUrl: 'https://archive.org/details/book1',
    additionalEditionUrls: ['https://onthewing.org/book2'],
  });
  assert.equal(resolveAllowlistedFetchUrls(p), null);
  assert.equal(resolveAllowlistedFetchUrls(prospect({ clearedEditionUrl: '', additionalEditionUrls: [] })), null);
});

test('staging confinement: only paths at/under content/staging/ are allowed', () => {
  const root = '/repo';
  assert.equal(isWithinStaging(root, 'content/staging/foo/body.md'), true);
  assert.equal(isWithinStaging(root, '/repo/content/staging/foo/raw.txt'), true);
  assert.equal(isWithinStaging(root, 'content/staging'), true);
  assert.equal(isWithinStaging(root, 'app/page.tsx'), false);
  assert.equal(isWithinStaging(root, 'content/published/foo.md'), false);
  assert.equal(isWithinStaging(root, 'content/staging/../../etc/passwd'), false);
  assert.equal(isWithinStaging(root, '/etc/passwd'), false);
});

test('slugFor + dedupeKey are stable and conservative', () => {
  assert.equal(slugFor('Gregory the Great — Book of Pastoral Rule', 'Gregory the Great'), 'book-of-pastoral-rule-great');
  assert.equal(dedupeKey('Grégoire', 'De Anima'), dedupeKey('Gregoire', 'De  Anima!'));
  assert.notEqual(dedupeKey('X', 'On the Incarnation'), dedupeKey('X', 'Incarnation'));
});

test('extractClearanceRecord copies the basis verbatim and best-effort parses years/translator', () => {
  const rec = extractClearanceRecord(prospect(), 'archive.org');
  assert.ok(rec);
  assert.equal(rec!.pdBasis, 'Translated by James Barmby (NPNF II.12); published 1895, public domain.');
  assert.equal(rec!.translator, 'James Barmby');
  assert.equal(rec!.publicationYear, 1895);
  assert.equal(rec!.ocrSource, 'archive.org');
  assert.equal(extractClearanceRecord(prospect({ translationNotes: '' }), 'archive.org'), null);
});
