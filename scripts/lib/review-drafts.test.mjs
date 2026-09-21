/**
 * Unit tests for the pure decisions in review-drafts.mjs.
 *   node --test scripts/lib/review-drafts.test.mjs
 *
 * These cover the two expensive failure modes of generate-review-drafts.mjs:
 * regenerating rows that already have drafts (spend with no benefit, and it
 * overwrites work), and skipping rows that need them (a card with no summary
 * blocks a publish). The script runs over 316 texts, so both are real money.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectNoteTargets,
  selectSummaryTargets,
  selectDescriptionTargets,
  summarySourceFor,
  costReport,
  PRICES,
} from './review-drafts.mjs';

const texts = [
  { id: 'a', note_draft: 'A note.', summary: null, summary_draft: null, body: 'body a' },
  { id: 'b', note_draft: null, summary: null, summary_draft: null, body: 'body b' },
  { id: 'c', note_draft: 'A note.', summary: 'A live summary.', summary_draft: null, body: 'body c' },
  { id: 'd', note_draft: 'A note.', summary: null, summary_draft: 'A drafted summary.', body: 'body d' },
];

test('introductions: only the text that has none', () => {
  assert.deepEqual(selectNoteTargets(texts).map(t => t.id), ['b']);
});

test('summaries: skips both a live summary and an existing draft', () => {
  // c has a live summary, d has a draft — regenerating either is pure waste,
  // and for d it would silently discard an edit already made in the queue.
  assert.deepEqual(selectSummaryTargets(texts).map(t => t.id), ['a', 'b']);
});

test('--force regenerates everything in scope', () => {
  assert.equal(selectNoteTargets(texts, { force: true }).length, 4);
  assert.equal(selectSummaryTargets(texts, { force: true }).length, 4);
});

test('a whitespace-only draft counts as absent, not as done', () => {
  // Otherwise a row saved as "  " is skipped forever by the generator and then
  // rejected by the publish gate — stuck with no way out but a manual edit.
  const blank = [{ id: 'x', note_draft: '   ', summary: '', summary_draft: '\n' }];
  assert.equal(selectNoteTargets(blank).length, 1);
  assert.equal(selectSummaryTargets(blank).length, 1);
});

test('collection descriptions follow the same live-or-draft rule', () => {
  const collections = [
    { id: '1', description: null, description_draft: null },
    { id: '2', description: 'Live.', description_draft: null },
    { id: '3', description: null, description_draft: 'Drafted.' },
  ];
  assert.deepEqual(selectDescriptionTargets(collections).map(c => c.id), ['1']);
  assert.equal(selectDescriptionTargets(collections, { force: true }).length, 3);
});

test('summary source prefers the note_draft over the body', () => {
  // The whole cost argument for this script rests on this preference holding.
  assert.deepEqual(
    summarySourceFor({ note_draft: 'A note.', body: 'A very long body...' }),
    { source: 'A note.', from: 'note_draft' }
  );
});

test('summary source falls back to the body, then gives up', () => {
  assert.deepEqual(
    summarySourceFor({ note_draft: null, body: 'A very long body...' }),
    { source: 'A very long body...', from: 'body' }
  );
  assert.deepEqual(
    summarySourceFor({ note_draft: null, body: null }),
    { source: null, from: 'none' }
  );
});

test('cost report prices each model separately and totals them', () => {
  const spend = new Map([
    ['claude-opus-4-7', { inputTokens: 1_000_000, outputTokens: 100_000 }],
    ['claude-haiku-4-5-20251001', { inputTokens: 2_000_000, outputTokens: 200_000 }],
  ]);
  const { total, unpriced } = costReport(spend);
  // opus: 1.0*$5 + 0.1*$25 = $7.50 · haiku: 2.0*$1 + 0.2*$5 = $3.00
  assert.equal(unpriced.length, 0);
  assert.ok(Math.abs(total - 10.5) < 1e-9, `expected $10.50, got $${total}`);
});

test('an unpriced model is named, not silently costed at zero', () => {
  // An understated bill is worse than an obviously incomplete one.
  const spend = new Map([['some-future-model', { inputTokens: 5_000_000, outputTokens: 1_000_000 }]]);
  const { total, unpriced, lines } = costReport(spend);
  assert.equal(total, 0);
  assert.deepEqual(unpriced, ['some-future-model']);
  assert.ok(lines[0].includes('no price on file'));
});

test('the priced models include the two this script actually calls', () => {
  // If either default model id drifts out of the table, every run silently
  // reports $0.00 — which is exactly when a cost report stops being useful.
  assert.ok(PRICES['claude-opus-4-7'], 'NOTE_MODEL default must be priced');
  assert.ok(PRICES['claude-haiku-4-5-20251001'], 'SUMMARY_MODEL default must be priced');
});

test('an empty run reports no cost rather than throwing', () => {
  const { lines, total, unpriced } = costReport(new Map());
  assert.deepEqual(lines, []);
  assert.equal(total, 0);
  assert.deepEqual(unpriced, []);
});
