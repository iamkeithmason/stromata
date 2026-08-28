/**
 * Shared types for the Scout agent (corpus gap analysis → Notion proposals).
 *
 * The Scout is read-only against the corpus and Notion; its only write is
 * creating provisional proposal rows in the Content Prospect List, and only
 * through the contract-enforcing PreToolUse hook. See scout.ts for the flow.
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

/** Copyright triage hint — a hint for the editor, never a clearance decision. */
export type CopyrightFlag = 'likely-clear' | 'needs-check' | 'trap-adjacent';

/**
 * The raw proposal the agent emits via the `propose_prospect` tool. These are
 * the logical contract fields; contract.ts validates them and notion.ts maps
 * them onto the live Content Prospect List property schema.
 */
export interface ProposalInput {
  /** Display title, "Author — Work". */
  title: string;
  author: string;
  /** Work title on its own (used for the dedupe key). */
  work: string;
  /** Canonical tradition name — must resolve to a Notion Tradition option. */
  tradition: string;
  /** Canonical era name — must resolve to a Notion Era option. */
  era: string;
  /** Optional genre — must resolve to a Notion Genre option if present. */
  genre?: string;
  /** Author death year, for the copyright triage. */
  deathYear?: number | null;
  /** Judgment inputs, each 1–5 (see scoring.ts for how they combine). */
  impact: number;
  confidence: number;
  ease: number;
  /** Is the author a Tier-1 search-driver (a recognisable named entity)? */
  tier1: boolean;
  /** One line: which gap this fills and why it matters now. */
  rationale: string;
  /** One line: is the author a Tier-1 search-driver, and why. */
  discoveryNote: string;
  /** Unverified URL hint(s) where the text might be sourced. */
  candidateSources: string[];
  /** Copyright triage hint + one-line reason. */
  copyrightFlag: CopyrightFlag;
  copyrightReason: string;
}

/** The computed score bundle attached to a proposal after scoring. */
export interface ScoredProposal extends ProposalInput {
  dedupeKey: string;
  /** Deterministic ICE score used for threshold + ranking. */
  iceScore: number;
  traditionWeight: number;
  medievalBonus: number;
  /** Projection onto the live Notion 1–3 axes. */
  value: number;
  complexity: number;
  effort: number;
}

/** Discriminated skip reasons — no candidate is ever dropped silently. */
export type SkipReason =
  | 'already-published'
  | 'already-proposed'
  | 'copyright-excluded'
  | 'below-threshold'
  | 'duplicate-in-batch'
  | 'over-cap'
  | 'contract-violation';

export interface SkipRecord {
  title: string;
  author: string;
  reason: SkipReason;
  detail: string;
}

/** What the contract hook decides for a single proposed write. */
export interface ContractDecision {
  allow: boolean;
  reason?: SkipReason;
  detail?: string;
}
