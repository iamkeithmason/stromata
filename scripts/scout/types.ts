/**
 * Shared types for the Scout agent (corpus gap analysis → Notion proposals).
 *
 * The Scout is read-only against the corpus and Notion; its only write is
 * creating provisional proposal rows in the Content Prospect List, and only
 * through the contract-enforcing PreToolUse hook. See scout.ts for the flow.
 *
 * Scoring model (v0.1): the Content Prospect List scores on Value / Complexity /
 * Effort — each an integer 1–3 — with a read-only Notion Score formula
 * (Value ÷ (Complexity + Effort)). The agent emits ONLY those three integers;
 * every aggregate is derived deterministically (scoring.ts). There is no ICE.
 */

/** A cell of the coverage map: one tradition × era intersection. */
export interface CoverageCell {
  tradition: string; // canonical tradition name (Notion vocabulary)
  era: string; // canonical era name (Notion vocabulary)
  publishedTexts: number;
}

/** The read-only picture of what the corpus already holds. */
export interface CoverageMap {
  /** Published-text counts keyed by `${tradition} :: ${era}`. */
  cells: Record<string, CoverageCell>;
  /** Every author name already in the database (published or not). */
  coveredAuthors: Set<string>;
  /** Normalised `author + work` dedupe keys for every text already in the DB. */
  coveredWorks: Set<string>;
  /** Total published texts, for context in the prompt. */
  totalPublished: number;
  /** Under-filled high-priority cells, precomputed for the prompt. */
  gaps: Array<{ tradition: string; era: string; publishedTexts: number; weight: number }>;
}

/** An existing Content Prospect List row, reduced to what dedupe needs. */
export interface ExistingProspect {
  title: string;
  author: string;
  status: string;
  dedupeKey: string; // normalised author + work
}

/**
 * The raw proposal the agent emits via the `propose_prospect` tool. The agent's
 * job is the 1–3 judgement on Value / Complexity / Effort plus the author's
 * dates and a proposed tradition; Era is derived (never proposed) and the
 * tradition is validated in code. Nothing here is an aggregate.
 */
export interface ProposalInput {
  /** Display title, "Author — Work". */
  title: string;
  author: string;
  /** Work title on its own (used for the dedupe key). */
  work: string;
  /** Proposed tradition — validated/possibly cleared by the tradition guard. */
  tradition?: string;
  /** Optional genre — must resolve to a Notion Genre option if present. */
  genre?: string;
  /** Author dates. Death year drives Era, the tradition guard, and the copyright gate. */
  birthYear?: number | null;
  deathYear?: number | null;
  floruitYear?: number | null;
  /** The three score inputs, each an integer 1–3. */
  value: number; // editorial priority × search gravity — higher is better
  complexity: number; // copyright + source availability — higher is WORSE
  effort: number; // length + processing work — higher is WORSE
  /** Is the author a Tier-1 search-driver? Informs the discovery note, not the score. */
  tier1: boolean;
  /** One line: which gap this fills and why it matters now. */
  rationale: string;
  /** One line: is the author a Tier-1 search-driver, and why. */
  discoveryNote: string;
  /** Unverified URL hint(s) where the text might be sourced. */
  candidateSources: string[];
  /** Copyright / translation / source reasoning — encoded also by the Complexity score. */
  translationNotes: string;
}

/** Which taxonomy correction happened to a proposal, for the notes + report. */
export type TaxonomyFlag = 'auto' | 'needs-editorial';

/** The processed proposal: derived Era, resolved tradition, score, dedupe key. */
export interface ScoredProposal extends ProposalInput {
  dedupeKey: string;
  /** Canonical Score = Value / (Complexity + Effort). The single ranking number. */
  score: number;
  /** Derived from the death year (fallback floruit/birth); null if dates unknown. */
  era: string | null;
  /** Final tradition after the guard: a valid option, or null (cleared → needs-editorial). */
  resolvedTradition: string | null;
  /** True when the tradition or era was cleared and needs an editorial decision. */
  needsEditorial: boolean;
  /** ↻ / ⚑ marker lines recorded in Editorial notes. */
  taxonomyNotes: string[];
}

/** Discriminated skip reasons — no candidate is ever dropped silently. */
export type SkipReason =
  | 'already-published'
  | 'already-proposed'
  | 'rights-excluded'
  | 'below-threshold'
  | 'duplicate-in-batch'
  | 'over-cap';

export interface SkipRecord {
  title: string;
  author: string;
  reason: SkipReason;
  detail: string;
}
