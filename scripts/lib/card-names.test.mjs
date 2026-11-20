/**
 * Tests for the card-name check. The titles are real Stromata PRs from Nov 2026,
 * so the routine exemptions are tested against the shapes routines actually use.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardLines, classify, summarise } from './card-names.mjs';

test('a Card line on the first line names the card, exactly as written', () => {
  const body = 'Card: Search: whole-word body matching with relevance ranking (backend)\n\n## What';
  assert.deepEqual(classify({ title: 'Search: whole-word ranked body matching', body }), {
    status: 'named',
    cards: ['Search: whole-word body matching with relevance ranking (backend)'],
  });
});

test('several Card lines are all kept, in order', () => {
  const body = 'Card: Genre ornaments on book covers\nCard: Woodcut publisher\'s mark: the S woven with a cross\n';
  assert.equal(cardLines(body).length, 2);
});

test('Card: none is an explicit no-card PR, not a gap', () => {
  assert.equal(classify({ title: 'Favicon from the publisher\'s mark', body: 'Card: none (small fix)\n' }).status, 'none');
});

test('backticks and bold around the line are tolerated', () => {
  assert.deepEqual(cardLines('**Card:** `Site canvas: zoomable map of key pages, linked by real reader clicks`'),
    ['Site canvas: zoomable map of key pages, linked by real reader clicks']);
});

test('a body that only MENTIONS the convention is missing, not named', () => {
  // #230's body quoted "Card:` line (the convention starts…)" mid-sentence; that is not a Card line.
  const body = 'Note: the `Card:` line (the convention starts with PRs opened from 16 Nov).';
  assert.equal(classify({ title: 'Docs tweak', body }).status, 'missing');
});

test('a PR with no Card line at all fails: absence is never a pass', () => {
  assert.equal(classify({ title: 'Editorial paragraph breaks for walls of text: flag at import', body: '## Why\n…' }).status, 'missing');
});

test('routine PRs are exempt by title', () => {
  for (const title of ['Release 2026-11-16', 'Analytics digest — 2026-11-16', 'Pipeline run 2026-11-16: 5 texts imported as drafts',
    'Sourcer — staged draft bundle(s) (run 41314524875)', 'Screens reference — 2026-11-10']) {
    assert.equal(classify({ title, body: '' }).status, 'routine', title);
  }
});

test('summarise fails only on missing', () => {
  const s = summarise([
    { number: 1, title: 'Release 2026-11-16', body: '' },
    { number: 2, title: 'A', body: 'Card: none' },
    { number: 3, title: 'B', body: 'Card: X' },
  ]);
  assert.equal(s.fail, false);
  assert.equal(summarise([{ number: 4, title: 'C', body: '' }]).fail, true);
});
