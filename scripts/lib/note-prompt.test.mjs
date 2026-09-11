/**
 * Unit tests for the pure (no-API) helpers in note-prompt.mjs.
 *   node --test scripts/lib/note-prompt.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findBannedPhrases,
  endsOnCompleteSentence,
  trimToCompleteSentence,
} from './note-prompt.mjs';

test('findBannedPhrases catches the templated closer', () => {
  const note = 'A vivid account of one bishop rebuking another. Expect measured, pastoral instruction rather than a treatise.';
  const hits = findBannedPhrases(note);
  assert.ok(hits.some((h) => h.includes('Expect')), 'should flag the "Expect…" closer');
  assert.ok(hits.some((h) => h.includes('rather than')), 'should flag the "X rather than Y" contrast');
});

test('findBannedPhrases catches dated-participle openers and stock flourishes', () => {
  assert.ok(findBannedPhrases('Written in 1413, this treatise dismantles papal authority.').length > 0);
  assert.ok(findBannedPhrases('Composed around 401 during a controversy, it defends marriage.').length > 0);
  assert.ok(findBannedPhrases('The argument would shape the Reformation a century later.').length > 0);
  assert.ok(findBannedPhrases('He works through the objections point by point.').length > 0);
});

test('findBannedPhrases returns empty for a clean, content-first note', () => {
  const clean = 'Monica dies at Ostia, and her son sets down the vision they shared at a window overlooking the garden. The grief is offered to God, not arranged into memoir.';
  assert.deepEqual(findBannedPhrases(clean), []);
});

test('endsOnCompleteSentence distinguishes complete from truncated', () => {
  assert.equal(endsOnCompleteSentence('The prose is prayer.'), true);
  assert.equal(endsOnCompleteSentence('A greater spectacle to come!'), true);
  assert.equal(endsOnCompleteSentence('The famous line, "the blood of Christians is seed."'), true);
  assert.equal(endsOnCompleteSentence('pressing the hearer toward wonder rather than assent to prop'), false);
  assert.equal(endsOnCompleteSentence('and aimed at fortif'), false);
});

test('trimToCompleteSentence heals a mid-word truncation', () => {
  const cut = 'A teacher speaking aloud to a congregation. Patient and evidentiary, aimed at fortif';
  assert.equal(trimToCompleteSentence(cut), 'A teacher speaking aloud to a congregation.');
});

test('trimToCompleteSentence leaves a clean note unchanged', () => {
  const clean = 'The road, the burden, the river, and the shining city.';
  assert.equal(trimToCompleteSentence(clean), clean);
});

test('trimToCompleteSentence returns empty when there is no complete sentence', () => {
  assert.equal(trimToCompleteSentence('a fragment with no terminal punctuation'), '');
});
