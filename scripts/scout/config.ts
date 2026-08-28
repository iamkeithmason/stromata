/**
 * Scout configuration — the priority model, scoring thresholds, run caps, the
 * Notion write mapping, and model IDs. Everything tunable lives here so the
 * agent's behaviour is governed by config rather than by prose that can drift.
 *
 * Reconciled against the LIVE Content Prospect List schema (data source
 * e3236509-a018-494c-93cf-9a035f3d10a8) on 2026-08-28:
 *   - The DB scores on Value / Complexity / Effort (each 1–3) plus a read-only
 *     Score formula — NOT Impact/Confidence/Ease. We compute ICE internally for
 *     ranking + the threshold, then PROJECT onto the native 1–3 axes so agent
 *     rows sort alongside Keith's existing rows under the same Score formula.
 *   - Status has no "Proposed" option; we write a new provisional value that
 *     Notion auto-creates on first page-create. It is deliberately distinct from
 *     every human status so agent proposals stay filterable.
 */

import type { CopyrightFlag } from './types';

// ---------------------------------------------------------------------------
// Priority model (from the PRD) — tradition weights + medieval bonus.
// ---------------------------------------------------------------------------

export type PriorityBand = 'high' | 'medium' | 'low';

export const BAND_WEIGHT: Record<PriorityBand, number> = {
  high: 1.0,
  medium: 0.66,
  low: 0.33,
};

/**
 * Canonical tradition → priority band. Canonical names match the Notion
 * Tradition select options exactly. `aliases` cover the spellings that come
 * back from Supabase (`traditions.name`) so the coverage map and the Notion
 * write agree on one canonical name.
 */
export const TRADITIONS: Array<{
  canonical: string;
  band: PriorityBand;
  /** Alternate names seen in Supabase / CLAUDE.md vocab. */
  aliases: string[];
}> = [
  { canonical: 'Early Church', band: 'high', aliases: ['Early Church (pre-Nicene)', 'early-church'] },
  { canonical: 'Patristic', band: 'high', aliases: ['patristic'] },
  { canonical: 'Byzantine', band: 'high', aliases: ['Imperial', 'imperial', 'byzantine'] },
  { canonical: 'Roman Catholic', band: 'high', aliases: ['roman-catholic'] },
  { canonical: 'Anglican', band: 'high', aliases: ['anglican'] },
  { canonical: 'Oriental Orthodox', band: 'medium', aliases: ['oriental-orthodox'] },
  { canonical: 'Eastern Orthodox', band: 'medium', aliases: ['eastern-orthodox'] },
  { canonical: 'Reformed', band: 'medium', aliases: ['reformed'] },
  { canonical: 'Lutheran', band: 'medium', aliases: ['lutheran'] },
  // NB: Methodist / Radical Reformation are in the priority model but have no
  // Notion Tradition option. They score Low and rarely clear the threshold; if
  // one ever does, the contract hook blocks it (no valid controlled value) with
  // a clear reason rather than inventing a property option.
  { canonical: 'Methodist', band: 'low', aliases: ['methodist'] },
  { canonical: 'Radical Reformation', band: 'low', aliases: ['radical-reformation'] },
  { canonical: 'Ecumenical', band: 'low', aliases: ['ecumenical'] },
];

/** Tradition options that actually exist on the Notion Content Prospect List. */
export const NOTION_TRADITIONS = [
  'Early Church',
  'Patristic',
  'Byzantine',
  'Oriental Orthodox',
  'Eastern Orthodox',
  'Roman Catholic',
  'Anglican',
  'Reformed',
  'Lutheran',
  'Ecumenical',
] as const;

/**
 * Canonical era → { medieval bonus? }. Canonical names match the Notion Era
 * select options. Medieval-era candidates (High/Late Medieval) get a bonus
 * regardless of tradition, per the PRD.
 */
export const ERAS: Array<{ canonical: string; medievalBonus: boolean; aliases: string[] }> = [
  { canonical: 'Apostolic', medievalBonus: false, aliases: ['apostolic'] },
  { canonical: 'Ante-Nicene', medievalBonus: false, aliases: ['ante-nicene'] },
  { canonical: 'Nicene & Post-Nicene', medievalBonus: false, aliases: ['nicene-post-nicene'] },
  { canonical: 'Early Medieval', medievalBonus: false, aliases: ['early-medieval'] },
  { canonical: 'High Medieval', medievalBonus: true, aliases: ['high-medieval'] },
  { canonical: 'Late Medieval', medievalBonus: true, aliases: ['late-medieval'] },
  { canonical: 'Reformation', medievalBonus: false, aliases: ['reformation'] },
  { canonical: 'Post-Reformation', medievalBonus: false, aliases: ['post-reformation'] },
  { canonical: 'Modern', medievalBonus: false, aliases: ['modern'] },
];

export const NOTION_ERAS = ERAS.map((e) => e.canonical);

/** Genre options that exist on the Notion Content Prospect List. */
export const NOTION_GENRES = [
  'Homily', 'Sermon', 'Letter', 'Treatise', 'Essay', 'Meditation', 'Rule',
  'Prayer', 'Catechesis', 'Commentary', 'Dialogue', 'Hymn', 'Confession',
  'Hagiography', 'Apology', 'Exegesis',
] as const;

// ---------------------------------------------------------------------------
// Scoring — ICE for ranking + threshold; projection to Notion 1–3 axes.
// ---------------------------------------------------------------------------

export const SCORING = {
  /**
   * Bonus added to a candidate's weighted impact when its era carries the
   * medieval bonus. Impact base is 1–5; +1.0 is a full step.
   */
  medievalBonus: 1.0,
  /** Multiplier on impact when the author is a Tier-1 search-driver. */
  tier1Multiplier: 1.25,
  /**
   * ICE = weightedImpact × confidence × ease, where each input is ~1–5.
   * Raw range is roughly 1–160+; the threshold is on this raw scale.
   */
  threshold: 28,
} as const;

/** Default per-run proposal cap. Ten good ones beats sixty at once. */
export const DEFAULT_MAX_PROPOSALS = 10;

/**
 * The provisional Status written on every agent row. Deliberately NOT one of
 * Keith's human statuses (Unplanned / Needs investigation / Rights unclear /
 * Text available / In progress / Live) — Notion auto-creates this select option
 * on the first create, and it is the review gate: agent proposals land flagged.
 */
export const PROVISIONAL_STATUS = 'Proposed — agent';

/**
 * Statuses that read as decided/accepted/scheduled — the hook blocks any write
 * whose Status is not exactly PROVISIONAL_STATUS, but these are called out so a
 * config change can never accidentally let one through.
 */
export const FORBIDDEN_STATUSES = ['Text available', 'In progress', 'Live'];

export const GENERATED_BY = 'scout-agent v0';

// ---------------------------------------------------------------------------
// Seed list (config hook only — do not scrape). A Davenant-syllabus priority
// list of authors/works. When populated, a candidate whose author or work
// matches (case-insensitive substring) is flagged `seed: true` in the prompt so
// the agent weights it up. Left empty for v0 by design.
// ---------------------------------------------------------------------------

export const SEED_PRIORITIES: Array<{ author?: string; work?: string; note?: string }> = [
  // e.g. { author: 'Richard Hooker', work: 'Of the Laws of Ecclesiastical Polity' },
];

// ---------------------------------------------------------------------------
// Notion write mapping — logical contract fields → live property names.
// Any logical field with no dedicated property is folded into Editorial notes /
// Translation notes / the page body rather than failing the run.
// ---------------------------------------------------------------------------

export const NOTION = {
  dataSourceId: process.env.SCOUT_NOTION_DATA_SOURCE_ID || 'e3236509-a018-494c-93cf-9a035f3d10a8',
  apiVersion: process.env.SCOUT_NOTION_VERSION || '2025-09-03',
  /** Property names as they exist on the live schema. */
  props: {
    title: 'Title',
    author: 'Author',
    tradition: 'Tradition',
    era: 'Era',
    genre: 'Genre',
    status: 'Status',
    value: 'Value',
    complexity: 'Complexity',
    effort: 'Effort',
    referenceUrl: 'Reference URL',
    editorialNotes: 'Editorial notes',
    translationNotes: 'Translation notes',
  },
} as const;

// ---------------------------------------------------------------------------
// Models — Sonnet 5 for the Scout's reasoning (gap analysis + rationale). Haiku
// is offered for mechanical formatting but v0 does that deterministically in TS,
// so only the Scout model is used. Overridable via env for pinning.
// ---------------------------------------------------------------------------

export const MODELS = {
  scout: process.env.SCOUT_MODEL || 'claude-sonnet-5',
  formatting: process.env.SCOUT_FORMATTING_MODEL || 'claude-haiku-4-5-20251001',
} as const;

// ---------------------------------------------------------------------------
// Copyright triage → a Complexity floor. The triage hint is advisory (HARD
// CONSTRAINT 3 stays a human call) but it should still move the source-risk
// axis: a trap-adjacent candidate can never read as easily sourced.
// ---------------------------------------------------------------------------

export const COPYRIGHT_COMPLEXITY_FLOOR: Record<CopyrightFlag, number> = {
  'likely-clear': 1,
  'needs-check': 2,
  'trap-adjacent': 3,
};

/**
 * The provenance caveat stamped literally onto every proposal. States the
 * suggestion is unverified and requires editorial confirmation.
 */
export const PROVENANCE_CAVEAT =
  'UNVERIFIED agent proposal. Source, copyright status, and translation provenance are ' +
  'triage hints only and require editorial confirmation before any sourcing or import.';
