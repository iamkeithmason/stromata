/**
 * Score-formula guard. `computeScore` ports the live Notion Score formula
 * (Content Prospect List → Score property): Value ÷ (Complexity + Effort).
 *
 * The fixtures below are real (Value, Complexity, Effort) → Score triples read
 * from the live database on 2026-08-28. If the Notion formula is ever changed,
 * these pinned values fail loudly instead of the agent ranking on stale logic.
 *
 * Run: npx tsx --test scripts/scout/scoring.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore } from './scoring';

// [value, complexity, effort, expectedScore] — verified against Notion rows.
const FIXTURES: Array<[number, number, number, number]> = [
  [3, 3, 3, 0.5], // Symeon the New Theologian — The Discourses
  [3, 2, 2, 0.75], // John Climacus — The Ladder of Divine Ascent
  [3, 1, 1, 1.5], // John of Damascus / Anselm / Ignatius / Julian
  [1, 1, 2, 1 / 3], // On Frequent Communicating
  [3, 3, 2, 0.6], // The Babylonian Captivity of the Church
  [2, 2, 1, 2 / 3], // Letter 54 / Odes of Solomon
  [2, 2, 2, 0.5], // Secular Authority
];

test('computeScore matches the live Notion Score on sampled rows', () => {
  for (const [v, c, e, expected] of FIXTURES) {
    assert.ok(
      Math.abs(computeScore(v, c, e) - expected) < 1e-9,
      `Value ${v} / (Complexity ${c} + Effort ${e}) should equal ${expected}`,
    );
  }
});

test('Score denominator is never zero (Complexity + Effort ≥ 2)', () => {
  // Every valid axis is 1–3, so the smallest denominator is 1 + 1 = 2.
  assert.equal(computeScore(3, 1, 1), 1.5);
  assert.ok(Number.isFinite(computeScore(1, 1, 1)));
});
