/**
 * Scoring and proposal processing.
 *
 * Canonical Score = Value / (Complexity + Effort) — the live Notion Score
 * formula (Content Prospect List → Score property), ported faithfully as a pure
 * function. It is the single source of truth for ranking and the below-threshold
 * cut. The agent never emits a score; it emits the three 1–3 integers only.
 *
 * `processProposal` composes the deterministic pieces — Score, derived Era, the
 * tradition guard, and the dedupe key — into the object the hook and the writer
 * both act on. Both call it, so they can never diverge.
 */

import { SCORING } from './config';
import { dedupeKey } from './contract';
import { deriveEra, representativeYear, resolveTradition } from './taxonomy';
import type { ProposalInput, ScoredProposal } from './types';

/**
 * The Notion Score formula: Value ÷ (Complexity + Effort). Complexity and Effort
 * are each ≥ 1, so the denominator is ≥ 2 — never zero.
 */
export function computeScore(value: number, complexity: number, effort: number): number {
  return value / (complexity + effort);
}

export function processProposal(input: ProposalInput): ScoredProposal {
  const year = representativeYear(input);
  const era = deriveEra(year);
  const traditionRes = resolveTradition(input.tradition, year);

  const taxonomyNotes: string[] = [];
  if (traditionRes.note) taxonomyNotes.push(traditionRes.note);
  if (era == null) taxonomyNotes.push('⚑ era: needs-editorial — dates unknown, era could not be derived');

  const needsEditorial = traditionRes.flag === 'needs-editorial' || era == null;

  return {
    ...input,
    dedupeKey: dedupeKey(input.author, input.work),
    score: computeScore(input.value, input.complexity, input.effort),
    era,
    resolvedTradition: traditionRes.tradition,
    needsEditorial,
    taxonomyNotes,
  };
}

export function isAboveThreshold(scored: ScoredProposal): boolean {
  return scored.score >= SCORING.threshold;
}
