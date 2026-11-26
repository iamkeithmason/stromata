/**
 * Tests for the Reading depth arithmetic. Run: node --test scripts/analytics/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReadingDepth, valueCounts } from './reading-depth.mjs';

// Real Umami rows for 2026-11-09T17:37Z → 2026-11-16T17:37Z.
const WEEK_OF_9_NOV = {
  depthValues: [{ value: '1', total: 200 }, { value: '2', total: 15 }],
  fromValues: [
    { value: 'collection-page', total: 11 },
    { value: 'author-page', total: 10 },
    { value: 'read-next', total: 3 },
    { value: 'text-sheet-read-next', total: 1 },
  ],
  pickValues: [{ value: 'theme', total: 2 }, { value: 'editorial', total: 2 }],
};

test('second-text rate is depth 2 ÷ depth 1, recorded to one decimal', () => {
  const { secondTextRate } = buildReadingDepth(WEEK_OF_9_NOV);
  assert.equal(secondTextRate.depth1, 200);
  assert.equal(secondTextRate.depth2, 15);
  assert.equal(secondTextRate.rate, 0.075);
  assert.equal(secondTextRate.percent, 7.5);
});

test('no depth-1 sessions gives no rate, not 0%', () => {
  const { secondTextRate } = buildReadingDepth({ depthValues: [], fromValues: [], pickValues: [] });
  assert.equal(secondTextRate.rate, null);
  assert.equal(secondTextRate.percent, null);
});

test('read-next clicks split by pick, every kind listed, reconciled against the surfaces', () => {
  const { readNext } = buildReadingDepth(WEEK_OF_9_NOV);
  assert.deepEqual(readNext.surfaces, { 'read-next': 3, 'text-sheet-read-next': 1 });
  assert.equal(readNext.total, 4);
  assert.deepEqual(readNext.byPick, { editorial: 2, author: 0, theme: 2, genre: 0 });
  assert.equal(readNext.pickTotal, 4);
  assert.equal(readNext.reconciles, true);
});

test('a click without a pick shows up as a reconciliation gap', () => {
  const { readNext } = buildReadingDepth({
    ...WEEK_OF_9_NOV,
    pickValues: [{ value: 'theme', total: 2 }, { value: 'editorial', total: 1 }],
  });
  assert.equal(readNext.pickTotal, 3);
  assert.equal(readNext.reconciles, false);
});

test('an unexpected pick value is kept, not dropped', () => {
  const { readNext } = buildReadingDepth({
    ...WEEK_OF_9_NOV,
    pickValues: [{ value: 'theme', total: 3 }, { value: 'random', total: 1 }],
  });
  assert.deepEqual(readNext.unknownPicks, { random: 1 });
  assert.equal(readNext.pickTotal, 4);
});

test('valueCounts accepts both Umami response shapes', () => {
  const m = valueCounts([{ x: 'a', y: 2 }, { value: 'a', total: 3 }, { name: 'b', count: 1 }]);
  assert.equal(m.get('a'), 5);
  assert.equal(m.get('b'), 1);
});
