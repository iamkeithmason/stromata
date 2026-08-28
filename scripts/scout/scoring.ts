/**
 * Deterministic scoring. The agent supplies judgment inputs (impact /
 * confidence / ease on a 1–5 scale, tier1, copyright flag); the PRIORITY MODEL
 * — tradition weight and the medieval bonus — is applied here in code so it can
 * never drift into the agent's discretion.
 *
 * Two outputs:
 *   1. `iceScore` — a raw ICE product used for the threshold and for ranking.
 *   2. `value` / `complexity` / `effort` — the projection onto the live Content
 *      Prospect List's native 1–3 axes, so agent rows sort under the same Score
 *      formula as Keith's hand-entered rows.
 */

import {
  BAND_WEIGHT,
  COPYRIGHT_COMPLEXITY_FLOOR,
  ERAS,
  SCORING,
  TRADITIONS,
} from './config';
import type { ProposalInput, ScoredProposal } from './types';
import { dedupeKey } from './contract';

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Resolve a tradition's priority weight from its canonical or alias name. */
export function traditionWeight(tradition: string): number {
  const t = TRADITIONS.find(
    (x) => x.canonical === tradition || x.aliases.includes(tradition),
  );
  return t ? BAND_WEIGHT[t.band] : BAND_WEIGHT.low;
}

/** Does this era carry the medieval bonus? */
export function eraHasMedievalBonus(era: string): boolean {
  const e = ERAS.find((x) => x.canonical === era || x.aliases.includes(era));
  return e?.medievalBonus ?? false;
}

/** Project the 1–5 confidence + copyright flag onto Complexity (1–3). */
function toComplexity(p: ProposalInput): number {
  const base = p.confidence >= 4 ? 1 : p.confidence >= 3 ? 2 : 3;
  const floor = COPYRIGHT_COMPLEXITY_FLOOR[p.copyrightFlag];
  return clampInt(Math.max(base, floor), 1, 3);
}

/** Project the 1–5 ease onto Effort (1–3): high ease → low effort. */
function toEffort(ease: number): number {
  return ease >= 4 ? 1 : ease >= 3 ? 2 : 3;
}

/** Project the weighted impact onto Value (1–3). */
function toValue(weightedImpact: number): number {
  return weightedImpact >= 4 ? 3 : weightedImpact >= 2 ? 2 : 1;
}

export function scoreProposal(p: ProposalInput): ScoredProposal {
  const weight = traditionWeight(p.tradition);
  const bonus = eraHasMedievalBonus(p.era) ? SCORING.medievalBonus : 0;
  const tierMult = p.tier1 ? SCORING.tier1Multiplier : 1;

  const weightedImpact = p.impact * weight * tierMult + bonus;
  const iceScore = weightedImpact * p.confidence * p.ease;

  return {
    ...p,
    dedupeKey: dedupeKey(p.author, p.work),
    iceScore: Math.round(iceScore * 10) / 10,
    traditionWeight: weight,
    medievalBonus: bonus,
    value: toValue(weightedImpact),
    complexity: toComplexity(p),
    effort: toEffort(p.ease),
  };
}

export function isAboveThreshold(scored: ScoredProposal): boolean {
  return scored.iceScore >= SCORING.threshold;
}
