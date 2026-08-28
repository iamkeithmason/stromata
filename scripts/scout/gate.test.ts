/**
 * Tests for the enforcement gate: discriminated skip reasons, the copyright
 * hard gate, dedupe, threshold, cap, and that a needs-editorial taxonomy flag
 * does not block the write. Runs without the Agent SDK, Supabase, Notion, or an
 * API key.
 *
 * Run: npx tsx --test scripts/scout/gate.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dedupeKey } from './contract';
import { computeScore } from './scoring';
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

/** A strong, contract-valid, above-threshold proposal (Score 1.5). */
function strong(over: Partial<ProposalInput> = {}): ProposalInput {
  return {
    title: 'Athanasius — On the Incarnation',
    author: 'Athanasius',
    work: 'On the Incarnation',
    tradition: 'Patristic',
    genre: 'Treatise',
    birthYear: 296,
    deathYear: 373,
    floruitYear: null,
    value: 3,
    complexity: 1,
    effort: 1,
    tier1: true,
    rationale: 'Fills a thin Patristic cell with a Tier-1 author.',
    discoveryNote: 'Athanasius is a recognisable search-driver.',
    candidateSources: ['https://www.newadvent.org/fathers/2802.htm'],
    translationNotes: 'd.373; NPNF translation, public domain.',
    ...over,
  };
}

function raw(p: ProposalInput): Record<string, unknown> {
  return { ...p } as Record<string, unknown>;
}

test('dedupeKey normalises punctuation, diacritics, case, whitespace; keeps distinct works apart', () => {
  assert.equal(
    dedupeKey('Athanasius', 'On the Incarnation'),
    dedupeKey('  ATHANASIUS ', 'On  the   Incarnation!'),
  );
  assert.equal(dedupeKey('Grégoire', 'De Anima'), dedupeKey('Gregoire', 'De Anima'));
  assert.notEqual(dedupeKey('Athanasius', 'On the Incarnation'), dedupeKey('Athanasius', 'Incarnation'));
});

test('gate accepts a strong candidate (dry-run records it, denies the write)', () => {
  const state = createRunState({ dryRun: true, maxProposals: 10, coverage: coverage(), existing: [] });
  const out = gateProposal(state, raw(strong()));
  assert.equal(state.accepted.length, 1);
  assert.equal(state.skips.length, 0);
  assert.equal(state.accepted[0].score, computeScore(3, 1, 1));
  assert.equal(state.accepted[0].era, 'Nicene & Post-Nicene');
  assert.equal(state.accepted[0].resolvedTradition, 'Patristic');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
});

test('gate allows the write in apply mode for a strong candidate', () => {
  const state = createRunState({ dryRun: false, maxProposals: 10, coverage: coverage(), existing: [] });
  const out = gateProposal(state, raw(strong()));
  assert.equal(out.hookSpecificOutput.permissionDecision, 'allow');
  assert.equal(state.accepted.length, 1);
});

test('contract-violation (value out of 1–3) is malformed, not a skip', () => {
  const state = createRunState({ dryRun: true, maxProposals: 10, coverage: coverage(), existing: [] });
  const out = gateProposal(state, raw(strong({ value: 4 })));
  assert.equal(state.malformed.length, 1);
  assert.equal(state.skips.length, 0);
  assert.equal(state.accepted.length, 0);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
});

test('contract-violation (no candidate source URL) is malformed', () => {
  const state = createRunState({ dryRun: true, maxProposals: 10, coverage: coverage(), existing: [] });
  gateProposal(state, raw(strong({ candidateSources: [] })));
  assert.equal(state.malformed.length, 1);
});

test('placeholder/probe proposals are rejected (bad Title form + example.com source)', () => {
  const state = createRunState({ dryRun: true, maxProposals: 10, coverage: coverage(), existing: [] });
  gateProposal(state, {
    title: 'test', author: 'test', work: 'test',
    value: 1, complexity: 1, effort: 1, tier1: false,
    rationale: 'x', discoveryNote: 'x', translationNotes: 'x',
    candidateSources: ['https://example.com'],
  });
  assert.equal(state.accepted.length, 0);
  assert.equal(state.malformed.length, 1);
  assert.match(state.malformed[0].detail, /Author — Work|Reference URL/);
});

test('skip: rights-excluded for a death year at/after the 1900 cutoff', () => {
  const state = createRunState({ dryRun: true, maxProposals: 10, coverage: coverage(), existing: [] });
  gateProposal(state, raw(strong({ author: 'C. S. Lewis', work: 'Mere Christianity', tradition: 'Anglican', deathYear: 1963, birthYear: 1898 })));
  assert.equal(state.skips[0]?.reason, 'rights-excluded');
});

test('a needs-editorial taxonomy flag does NOT block the write (tradition cleared, still accepted)', () => {
  // Anselm d.1109 proposed Anglican → tradition cleared + flagged, but valid to write.
  const state = createRunState({ dryRun: false, maxProposals: 10, coverage: coverage(), existing: [] });
  gateProposal(state, raw(strong({ title: 'Anselm — Monologion', author: 'Anselm of Canterbury', work: 'Monologion', tradition: 'Anglican', birthYear: 1033, deathYear: 1109 })));
  assert.equal(state.accepted.length, 1);
  assert.equal(state.accepted[0].resolvedTradition, null);
  assert.equal(state.accepted[0].needsEditorial, true);
  assert.equal(state.accepted[0].era, 'High Medieval');
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

test('skip: below-threshold when Score < 0.5', () => {
  const state = createRunState({ dryRun: true, maxProposals: 10, coverage: coverage(), existing: [] });
  // Value 1 / (Complexity 3 + Effort 3) = 0.167.
  gateProposal(state, raw(strong({ title: 'Obscure — Minor Tract', author: 'Obscure', work: 'Minor Tract', value: 1, complexity: 3, effort: 3 })));
  assert.equal(state.skips[0]?.reason, 'below-threshold');
});

test('skip: over-cap once the run cap is reached', () => {
  const state = createRunState({ dryRun: true, maxProposals: 1, coverage: coverage(), existing: [] });
  gateProposal(state, raw(strong()));
  gateProposal(state, raw(strong({ title: 'Basil — On the Holy Spirit', author: 'Basil', work: 'On the Holy Spirit', deathYear: 379 })));
  assert.equal(state.accepted.length, 1);
  assert.equal(state.skips.at(-1)?.reason, 'over-cap');
});

test('re-run convergence: a proposal already on the list is skipped, not re-accepted', () => {
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
