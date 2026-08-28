/**
 * Tests for the deterministic core: scoring projection + the enforcement gate's
 * discriminated skip reasons. These run without the Agent SDK, Supabase, Notion,
 * or an API key — they exercise exactly the contract logic that must not drift.
 *
 * Run: npx tsx --test scripts/scout/gate.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dedupeKey } from './contract';
import { scoreProposal } from './scoring';
import { createRunState, gateProposal } from './hook';
import type { CoverageMap, ExistingProspect, ProposalInput } from './types';

function coverage(overrides: Partial<CoverageMap> = {}): CoverageMap {
  return {
    cells: {},
    coveredAuthors: new Set(),
    coveredWorks: new Set(),
    totalPublished: 0,
    gaps: [],
    ...overrides,
  };
}

/** A strong, contract-valid, above-threshold proposal. */
function strong(over: Partial<ProposalInput> = {}): ProposalInput {
  return {
    title: 'Athanasius — On the Incarnation',
    author: 'Athanasius',
    work: 'On the Incarnation',
    tradition: 'Patristic', // HIGH band
    era: 'Nicene & Post-Nicene',
    genre: 'Treatise',
    deathYear: 373,
    impact: 5,
    confidence: 5,
    ease: 5,
    tier1: true,
    rationale: 'Fills a thin Patristic cell with a Tier-1 author.',
    discoveryNote: 'Athanasius is a recognisable search-driver.',
    candidateSources: ['https://www.newadvent.org/fathers/2802.htm'],
    copyrightFlag: 'likely-clear',
    copyrightReason: 'd.373; NPNF translation public domain.',
    ...over,
  };
}

function raw(p: ProposalInput): Record<string, unknown> {
  return { ...p } as Record<string, unknown>;
}

test('dedupeKey normalises punctuation, diacritics, case, and whitespace', () => {
  assert.equal(
    dedupeKey('Athanasius', 'On the Incarnation'),
    dedupeKey('  ATHANASIUS ', 'On  the   Incarnation!'),
  );
  assert.equal(dedupeKey('Grégoire', 'De Anima'), dedupeKey('Gregoire', 'De Anima'));
  // Conservative: distinct works must NOT collapse together.
  assert.notEqual(dedupeKey('Athanasius', 'On the Incarnation'), dedupeKey('Athanasius', 'Incarnation'));
});

test('scoreProposal applies tradition weight, medieval bonus, tier1, and 1–3 projection', () => {
  const s = scoreProposal(strong());
  assert.equal(s.traditionWeight, 1.0); // Patristic = HIGH
  assert.equal(s.medievalBonus, 0);
  // weightedImpact = 5 * 1.0 * 1.25 = 6.25 → Value 3
  assert.equal(s.value, 3);
  assert.equal(s.complexity, 1); // confidence 5 + likely-clear floor
  assert.equal(s.effort, 1); // ease 5
  assert.ok(s.iceScore >= 28);

  const med = scoreProposal(strong({ era: 'High Medieval' }));
  assert.equal(med.medievalBonus, 1.0);
  assert.ok(med.iceScore > s.iceScore); // bonus lifts a medieval candidate

  const low = scoreProposal(strong({ tradition: 'Ecumenical', tier1: false }));
  assert.equal(low.traditionWeight, 0.33); // LOW band
});

test('gate accepts a strong candidate (dry-run records it, denies the write)', () => {
  const state = createRunState({ dryRun: true, maxProposals: 10, coverage: coverage(), existing: [] });
  const out = gateProposal(state, raw(strong()));
  assert.equal(state.accepted.length, 1);
  assert.equal(state.skips.length, 0);
  // dry-run never writes: even an accepted proposal is denied at the tool.
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
});

test('gate allows the write in apply mode for a strong candidate', () => {
  const state = createRunState({ dryRun: false, maxProposals: 10, coverage: coverage(), existing: [] });
  const out = gateProposal(state, raw(strong()));
  assert.equal(out.hookSpecificOutput.permissionDecision, 'allow');
  assert.equal(state.accepted.length, 1);
});

test('skip: contract-violation on invalid tradition', () => {
  const state = createRunState({ dryRun: true, maxProposals: 10, coverage: coverage(), existing: [] });
  gateProposal(state, raw(strong({ tradition: 'Zoroastrian' })));
  assert.equal(state.skips[0]?.reason, 'contract-violation');
  assert.equal(state.accepted.length, 0);
});

test('skip: copyright-excluded for a post-1899 trap-adjacent author', () => {
  const state = createRunState({ dryRun: true, maxProposals: 10, coverage: coverage(), existing: [] });
  gateProposal(state, raw(strong({ deathYear: 1971, copyrightFlag: 'trap-adjacent' })));
  assert.equal(state.skips[0]?.reason, 'copyright-excluded');
});

test('skip: already-published when the work is in the corpus', () => {
  const cov = coverage({ coveredWorks: new Set([dedupeKey('Athanasius', 'On the Incarnation')]) });
  const state = createRunState({ dryRun: true, maxProposals: 10, coverage: cov, existing: [] });
  gateProposal(state, raw(strong()));
  assert.equal(state.skips[0]?.reason, 'already-published');
});

test('skip: already-proposed when it is already on the prospect list', () => {
  const existing: ExistingProspect[] = [
    { title: 'Athanasius — On the Incarnation', author: 'Athanasius', status: 'Text available', dedupeKey: dedupeKey('Athanasius', 'On the Incarnation') },
  ];
  const state = createRunState({ dryRun: true, maxProposals: 10, coverage: coverage(), existing });
  gateProposal(state, raw(strong()));
  assert.equal(state.skips[0]?.reason, 'already-proposed');
});

test('skip: duplicate-in-batch on the second identical proposal', () => {
  const state = createRunState({ dryRun: true, maxProposals: 10, coverage: coverage(), existing: [] });
  gateProposal(state, raw(strong()));
  gateProposal(state, raw(strong()));
  assert.equal(state.accepted.length, 1);
  assert.equal(state.skips.at(-1)?.reason, 'duplicate-in-batch');
});

test('skip: below-threshold for a weak candidate', () => {
  const state = createRunState({ dryRun: true, maxProposals: 10, coverage: coverage(), existing: [] });
  gateProposal(
    state,
    raw(strong({
      title: 'Obscure — Minor Tract', author: 'Obscure', work: 'Minor Tract',
      tradition: 'Ecumenical', impact: 1, confidence: 1, ease: 1, tier1: false,
    })),
  );
  assert.equal(state.skips[0]?.reason, 'below-threshold');
});

test('skip: over-cap once the run cap is reached', () => {
  const state = createRunState({ dryRun: true, maxProposals: 1, coverage: coverage(), existing: [] });
  gateProposal(state, raw(strong()));
  gateProposal(state, raw(strong({ title: 'Basil — On the Holy Spirit', author: 'Basil', work: 'On the Holy Spirit' })));
  assert.equal(state.accepted.length, 1);
  assert.equal(state.skips.at(-1)?.reason, 'over-cap');
});

test('re-run convergence: a proposal already on the list is skipped, not re-accepted', () => {
  // Simulate a second run: the first run's accepted rows now exist as prospects.
  const first = createRunState({ dryRun: false, maxProposals: 10, coverage: coverage(), existing: [] });
  gateProposal(first, raw(strong()));
  const asExisting: ExistingProspect[] = first.accepted.map((s) => ({
    title: s.title, author: s.author, status: 'Proposed — agent', dedupeKey: s.dedupeKey,
  }));
  const second = createRunState({ dryRun: false, maxProposals: 10, coverage: coverage(), existing: asExisting });
  gateProposal(second, raw(strong()));
  assert.equal(second.accepted.length, 0);
  assert.equal(second.skips[0]?.reason, 'already-proposed');
});
