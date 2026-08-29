/**
 * Sourcer configuration — the source allowlist, the run cap, the staging root,
 * the Notion property mapping, and the model IDs. Everything tunable lives here.
 *
 * The Sourcer is the mechanical half of "AI proposes, editor approves". It
 * acquires the ONE edition the editor pinned and marked rights-cleared, runs
 * deterministic cleanup, DETECTS (never corrects) the risky OCR classes, and
 * stages a reviewable draft bundle. It never chooses a source, never clears
 * copyright, never applies a probabilistic correction, and never touches the
 * live site or database. See README.md.
 *
 * Reconciled against the LIVE Content Prospect List schema (data source
 * e3236509-a018-494c-93cf-9a035f3d10a8): the Sourcer reads two human-owned
 * fields the editor sets — `Cleared edition URL` (url) and `Rights cleared`
 * (checkbox) — plus the free-text `Translation notes` provenance basis. It
 * writes nothing to Notion except (optionally, off by default) a Status bump.
 */

// ---------------------------------------------------------------------------
// Source allowlist. The editor pins a `Cleared edition URL`; the fetch tool
// resolves it SERVER-SIDE and refuses anything whose host is not on this list.
// Choosing a source is a copyright decision, so the agent can neither pass a URL
// nor reach a host the editor's pinned edition doesn't already live on.
//
// Matching is on the registrable-ish suffix: host === domain OR host ends with
// ".<domain>". CCEL renders dynamically and is deliberately absent — CCEL texts
// are taken via their Archive.org djvu.txt mirror (archive.org), never a live
// CCEL scrape.
// ---------------------------------------------------------------------------

export const SOURCE_ALLOWLIST = [
  'archive.org',
  'anglicanhistory.org',
  'sacred-texts.com',
  'wikisource.org', // the editor pins en.wikisource.org; the suffix covers it
  'newadvent.org',
] as const;

/** Obvious placeholder / private hosts — never a real cleared edition. */
export const FORBIDDEN_HOSTS = [
  'example.com',
  'example.org',
  'example.net',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '169.254.169.254', // cloud metadata endpoint — SSRF guard
] as const;

// ---------------------------------------------------------------------------
// Run bounds. Sourcing is heavy (fetch + clean + detect + model), so the
// default cap is deliberately small. One edition per prospect, always.
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_PROSPECTS = 3;

/** Politeness delay between fetches, in ms (rate-limit the allowlisted hosts). */
export const FETCH_DELAY_MS = Number(process.env.SOURCER_FETCH_DELAY_MS) || 1500;

/** Hard ceiling on a single fetch, in bytes (a djvu.txt scan can be large). */
export const MAX_FETCH_BYTES = Number(process.env.SOURCER_MAX_FETCH_BYTES) || 25 * 1024 * 1024;

/** The copyright safe-harbour cutoff for the AUTHOR (translation stays a human call). */
export const AUTHOR_COPYRIGHT_CUTOFF_YEAR = 1900;

// ---------------------------------------------------------------------------
// Staging — the ONLY tree the Sourcer may write into. The path-confinement hook
// blocks any write outside it; app source and DB layers are unreachable.
// ---------------------------------------------------------------------------

/** Relative to the repo root. Every staged bundle lives at `<STAGING_ROOT>/<slug>/`. */
export const STAGING_ROOT = 'content/staging';

/** The six files a complete bundle contains. */
export const BUNDLE_FILES = {
  raw: 'raw.txt', // immutable — the untouched fetch
  body: 'body.md', // deterministic clean only
  provenance: 'provenance.yml', // clearance record copied verbatim
  metadata: 'metadata.yml', // everything proposed:, editor confirms
  ocrReport: 'ocr-report.md', // detected-not-corrected, feeds --apply-reviewed
  summary: 'SOURCER.md', // human-readable bundle summary
} as const;

// ---------------------------------------------------------------------------
// Version stamp written into provenance.yml and the run log.
// ---------------------------------------------------------------------------

export const SOURCER_VERSION = 'sourcer-agent v0';

// ---------------------------------------------------------------------------
// Notion — logical field → live property name. READ only, plus one optional
// Status bump (off by default). The Sourcer never writes Value/Complexity/Effort
// or any scoring field.
// ---------------------------------------------------------------------------

export const NOTION = {
  dataSourceId:
    process.env.SOURCER_NOTION_DATA_SOURCE_ID || 'e3236509-a018-494c-93cf-9a035f3d10a8',
  apiVersion: process.env.SOURCER_NOTION_VERSION || '2025-09-03',
  props: {
    title: 'Title',
    author: 'Author',
    tradition: 'Tradition',
    era: 'Era',
    genre: 'Genre',
    status: 'Status',
    referenceUrl: 'Reference URL',
    editorialNotes: 'Editorial notes',
    translationNotes: 'Translation notes',
    // The two human-owned gate fields. If either is absent from the live schema,
    // reconcile() warns and the gate refuses every prospect (nothing is cleared).
    clearedEditionUrl: 'Cleared edition URL', // url — the pinned source
    rightsCleared: 'Rights cleared', // checkbox — a HUMAN sets this true
  },
  /** Status the Sourcer bumps a prospect to once staged — only when explicitly enabled. */
  inProgressStatus: 'In progress',
} as const;

// ---------------------------------------------------------------------------
// Models. Sonnet 5 for the metadata / collection-structure / detection-report
// reasoning; the deterministic cleanup is plain script, no model.
// ---------------------------------------------------------------------------

export const MODELS = {
  sourcer: process.env.SOURCER_MODEL || 'claude-sonnet-5',
} as const;

// ---------------------------------------------------------------------------
// The literal line stamped into every provenance.yml, asserting the values were
// copied from the human clearance record, not synthesised by the agent.
// ---------------------------------------------------------------------------

export const PROVENANCE_STAMP =
  'Values copied verbatim from the human clearance record on the Content Prospect List, ' +
  'not synthesised by the Sourcer. Copyright and translation-rights judgement remain the editor’s.';
