/**
 * Shared types for the Sourcer agent (cleared prospect → staged draft bundle).
 *
 * The Sourcer acquires the ONE edition the editor pinned and marked
 * rights-cleared, cleans deterministically, DETECTS (never corrects) the risky
 * OCR classes, and stages a reviewable bundle under content/staging/. It is
 * read-only against Notion (bar an optional Status bump) and the corpus, and it
 * never writes the live database or publishes. See sourcer.ts for the flow.
 */

// ---------------------------------------------------------------------------
// Intake — a cleared prospect and its human clearance record.
// ---------------------------------------------------------------------------

/**
 * A Content Prospect List row as the Sourcer reads it. The two gate-critical
 * fields — `clearedEditionUrl` and `rightsCleared` — are HUMAN-owned; the
 * Sourcer only checks they are present and well-formed, it never sets them.
 */
export interface ClearedProspect {
  /** Notion page id (drives fetch-URL resolution server-side — never agent-supplied). */
  id: string;
  pageUrl: string;
  title: string;
  author: string;
  /** Work title on its own (from the title, for the dedupe key + slug). */
  work: string;
  /** Deterministic slug used for the staging directory (`<STAGING_ROOT>/<slug>/`). */
  slug: string;
  /** Notion Tradition / Era / Genre selects (may be blank). Author-level; copied, never judged. */
  tradition: string | null;
  era: string | null;
  genre: string | null;
  status: string;
  /** The editor's pinned source. Empty → `no-cleared-edition`. */
  clearedEditionUrl: string;
  /** The human rights-cleared checkbox. False → `rights-not-cleared`. */
  rightsCleared: boolean;
  /** Free-text provenance basis (translator, edition/publication year, why PD). Copied verbatim. */
  translationNotes: string;
  /** The un-pinned candidate `Reference URL` (informational only; never fetched). */
  referenceUrl: string | null;
}

/** The clearance record copied verbatim into provenance.yml. Nothing here is synthesised. */
export interface ClearanceRecord {
  clearedEditionUrl: string;
  /** Best-effort structured reads of the basis (advisory); pdBasis is the authoritative verbatim copy. */
  translator: string | null;
  editionYear: number | null;
  publicationYear: number | null;
  /** The Translation-notes text, verbatim. */
  pdBasis: string;
  /** The host the pinned edition resolves to (e.g. "archive.org"). */
  ocrSource: string;
}

// ---------------------------------------------------------------------------
// Corpus view — SELECT-only reads for dedup + author checks.
// ---------------------------------------------------------------------------

export interface CorpusAuthor {
  name: string;
  deathYear: number | null;
}

export interface CorpusView {
  /** Normalised author+work dedupe keys for every text already in the DB. */
  coveredWorks: Set<string>;
  /** Slugs already present in the corpus (texts + collections). */
  coveredSlugs: Set<string>;
  /** Author records by normalised name, for the author-copyright / author-missing check. */
  authorsByKey: Map<string, CorpusAuthor>;
  totalTexts: number;
}

// ---------------------------------------------------------------------------
// The entry gate — discriminated refusals, no silent drops.
// ---------------------------------------------------------------------------

/** Every reason a prospect can be refused or flagged. */
export type RefusalReason =
  | 'rights-not-cleared'
  | 'no-cleared-edition'
  | 'source-not-allowlisted'
  | 'no-provenance-basis'
  | 'author-copyright-fail'
  | 'author-missing' // NOT an abort — stage the draft but flag it for the editor
  | 'already-present'
  | 'already-staged'
  | 'over-cap';

/** author-missing does not abort the text; it flags it. Everything else refuses. */
export type GateOutcome = 'pass' | 'flagged' | 'refused';

export interface GateDecision {
  prospect: ClearedProspect;
  outcome: GateOutcome;
  /** Set when outcome is 'refused' or 'flagged'. */
  reason: RefusalReason | null;
  detail: string;
  /** Editor-facing flags carried into the bundle (e.g. author-missing). */
  flags: string[];
}

// ---------------------------------------------------------------------------
// Detection — flagged, never corrected.
// ---------------------------------------------------------------------------

export type OcrQuality = 'high' | 'medium' | 'low';

/** One orphaned footnote marker (a superscript/bracketed ref with no landing note). */
export interface FootnoteOrphan {
  line: number;
  marker: string;
  context: string;
}

/** One run of suspect polytonic Greek (garbled accents/breathings), reported not fixed. */
export interface GreekFlag {
  line: number;
  text: string;
  note: string;
}

/** A near-homograph the editor must disambiguate — ALTERNATIVES offered, never applied. */
export interface HomographChoice {
  line: number;
  word: string;
  alternatives: string[];
  stakes: string;
}

/** Flat counts summary of a detection pass — carried into staging + the report. */
export interface DetectionSummary {
  ocrQuality: OcrQuality;
  scannoCount: number;
  footnoteOrphans: number;
  greekFlags: number;
  homographs: number;
  artefactDensity: number;
}

/** The detection result assembled into ocr-report.md. */
export interface DetectionResult {
  slug: string;
  /** The raw detect-scannos report body (apply-reviewed compatible). */
  scannoReport: string;
  scannoCount: number;
  footnoteOrphans: FootnoteOrphan[];
  greekFlags: GreekFlag[];
  homographs: HomographChoice[];
  /** Deterministic OCR-quality estimate from artefact density. */
  ocrQuality: OcrQuality;
  artefactDensity: number;
}

// ---------------------------------------------------------------------------
// Proposed metadata — everything the editor confirms. Nothing is applied.
// ---------------------------------------------------------------------------

export interface CollectionProposal {
  /** 'single' (one sustained argument), 'collection' (navigable divisions), 'excerpt' (long treatise). */
  shape: 'single' | 'collection' | 'excerpt';
  rationale: string;
  /** For 'collection'/'excerpt': the proposed ordered parts. Proposed only — the raw stays whole. */
  parts: Array<{ order: number; title: string; note?: string }>;
}

export interface ProposedMetadata {
  slug: string;
  title: string;
  author: string;
  /** Proposed genre (controlled vocab) — proposed:, editor confirms. */
  genre: string | null;
  /** Proposed theme slugs (≤6, controlled vocab) — proposed:, editor confirms. */
  themes: string[];
  ocrQuality: OcrQuality;
  collection: CollectionProposal;
  /** Editor-facing flags (e.g. author-missing → create author before import). */
  flags: string[];
}

// ---------------------------------------------------------------------------
// Bundle + run reporting.
// ---------------------------------------------------------------------------

export interface StagedBundle {
  slug: string;
  dir: string;
  files: string[];
  flags: string[];
}

export interface SkipRecord {
  title: string;
  author: string;
  reason: RefusalReason;
  detail: string;
}
