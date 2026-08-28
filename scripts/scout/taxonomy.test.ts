/**
 * Taxonomy regression — the exact 2026-08-28 batch corrections (Fix 2 & 3).
 * These pin the deterministic era derivation and tradition guard to the target
 * Keith corrected by hand, so the code reproduces the fix rather than
 * re-introducing the misclassifications.
 *
 * Run: npx tsx --test scripts/scout/taxonomy.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveEra, resolveTradition } from './taxonomy';

test('deriveEra places authors by death year (Apostolic is circa-100)', () => {
  assert.equal(deriveEra(108), 'Apostolic'); // Ignatius of Antioch
  assert.equal(deriveEra(99), 'Apostolic'); // Clement of Rome
  assert.equal(deriveEra(155), 'Ante-Nicene'); // Polycarp — strictly later
  assert.equal(deriveEra(649), 'Early Medieval'); // John Climacus
  assert.equal(deriveEra(749), 'Early Medieval'); // John of Damascus
  assert.equal(deriveEra(1022), 'High Medieval'); // Symeon the New Theologian
  assert.equal(deriveEra(1109), 'High Medieval'); // Anselm
  assert.equal(deriveEra(1359), 'Late Medieval'); // Gregory Palamas
  assert.equal(deriveEra(1416), 'Late Medieval'); // Julian of Norwich
  assert.equal(deriveEra(null), null);
  assert.equal(deriveEra(1950), null); // post-1900 never proposed
});

test('Ignatius (d.108, Early Church) — unchanged, valid', () => {
  const r = resolveTradition('Early Church', 108);
  assert.equal(r.tradition, 'Early Church');
  assert.equal(r.flag, null);
});

test('John of Damascus (d.749, proposed Patristic) — auto → Byzantine', () => {
  const r = resolveTradition('Patristic', 749);
  assert.equal(r.tradition, 'Byzantine');
  assert.equal(r.flag, 'auto');
  assert.match(r.note ?? '', /↻ tradition auto-set «Byzantine»/);
});

test('John Climacus (d.649, proposed Early Church) — auto → Byzantine', () => {
  const r = resolveTradition('Early Church', 649);
  assert.equal(r.tradition, 'Byzantine');
  assert.equal(r.flag, 'auto');
});

test('Symeon the New Theologian (d.1022, proposed Patristic) — auto → Byzantine', () => {
  const r = resolveTradition('Patristic', 1022);
  assert.equal(r.tradition, 'Byzantine');
  assert.equal(r.flag, 'auto');
});

test('Anselm (d.1109, proposed Anglican) — cleared + needs-editorial', () => {
  const r = resolveTradition('Anglican', 1109);
  assert.equal(r.tradition, null);
  assert.equal(r.flag, 'needs-editorial');
  assert.match(r.note ?? '', /needs-editorial/);
});

test('Julian of Norwich (d.1416, proposed Anglican) — cleared + needs-editorial', () => {
  const r = resolveTradition('Anglican', 1416);
  assert.equal(r.tradition, null);
  assert.equal(r.flag, 'needs-editorial');
});

test('Gregory Palamas (d.1359, proposed Patristic) — cleared + needs-editorial (post-1054, no auto)', () => {
  const r = resolveTradition('Patristic', 1359);
  assert.equal(r.tradition, null);
  assert.equal(r.flag, 'needs-editorial');
});

test('Oriental Orthodox / Ecumenical are never flagged on date alone', () => {
  assert.equal(resolveTradition('Oriental Orthodox', 1286).tradition, 'Oriental Orthodox');
  assert.equal(resolveTradition('Ecumenical', 1700).flag, null);
});

test('missing dates → cleared + needs-editorial regardless of proposal', () => {
  const r = resolveTradition('Roman Catholic', null);
  assert.equal(r.tradition, null);
  assert.equal(r.flag, 'needs-editorial');
});

test('valid in-window proposals pass unchanged', () => {
  assert.equal(resolveTradition('Roman Catholic', 1274).flag, null); // Aquinas
  assert.equal(resolveTradition('Lutheran', 1546).flag, null); // Luther
  assert.equal(resolveTradition('Patristic', 430).tradition, 'Patristic'); // Augustine
});
