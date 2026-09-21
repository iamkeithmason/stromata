/**
 * Scout configuration — priority guidance, scoring threshold, run cap, the
 * Notion write mapping, and model IDs. Everything tunable lives here.
 *
 * Reconciled against the LIVE Content Prospect List schema (data source
 * e3236509-a018-494c-93cf-9a035f3d10a8):
 *   - Scoring is Value / Complexity / Effort, each an integer 1–3, with a
 *     read-only Score formula = Value ÷ (Complexity + Effort). The agent emits
 *     only the three integers; Score is never written (scoring.ts owns the
 *     arithmetic).
 *   - Tradition options include Imperial and Oriental Orthodox (migration has
 *     landed). Era is derived from the author's dates, never proposed.
 *     NOTE: the Imperial option was called "Byzantine" in Notion until
 *     2026-09-21. It was renamed so Notion matches the site's own controlled
 *     vocabulary, which has always been `imperial` / "Imperial" — the old name
 *     existed only to be translated by a mapping line in CLAUDE.md. "Byzantine"
 *     survives as an alias below so an older row still resolves.
 *   - Status has no "Proposed" option; we write a provisional value that Notion
 *     auto-creates on first use, keeping agent proposals filterable.
 */

// ---------------------------------------------------------------------------
// Priority guidance (from the PRD). Under the V/C/E model these bands are
// PROMPT guidance for how the agent should weight its Value judgement — there
// is no code-level weighting or medieval-bonus arithmetic any more.
// ---------------------------------------------------------------------------

export type PriorityBand = 'high' | 'medium' | 'low';

/**
 * Canonical tradition → priority band + Supabase aliases. Canonical names match
 * the Notion Tradition select options exactly.
 */
export const TRADITIONS: Array<{ canonical: string; band: PriorityBand; aliases: string[] }> = [
  { canonical: 'Early Church', band: 'high', aliases: ['Early Church (pre-Nicene)', 'early-church'] },
  { canonical: 'Patristic', band: 'high', aliases: ['patristic'] },
  { canonical: 'Imperial', band: 'high', aliases: ['Byzantine', 'byzantine', 'imperial'] },
  { canonical: 'Roman Catholic', band: 'high', aliases: ['roman-catholic'] },
  { canonical: 'Anglican', band: 'high', aliases: ['anglican'] },
  { canonical: 'Oriental Orthodox', band: 'medium', aliases: ['oriental-orthodox'] },
  { canonical: 'Eastern Orthodox', band: 'medium', aliases: ['eastern-orthodox'] },
  { canonical: 'Reformed', band: 'medium', aliases: ['reformed'] },
  { canonical: 'Lutheran', band: 'medium', aliases: ['lutheran'] },
  { canonical: 'Methodist', band: 'low', aliases: ['methodist'] },
  { canonical: 'Radical Reformation', band: 'low', aliases: ['radical-reformation'] },
  { canonical: 'Ecumenical', band: 'low', aliases: ['ecumenical'] },
];

/**
 * Tradition options that actually exist on the Notion Content Prospect List.
 *
 * This list is what the Scout is allowed to WRITE, so every entry must name a
 * live Notion option: writing a value that does not exist either fails
 * validation or silently creates a stray option, and a stray option is worse
 * than a failure because nothing announces it.
 *
 * `Byzantine` was listed here transitionally while the option was being renamed
 * to Imperial. Keith made that rename in the Notion UI on 2026-09-21 — verified
 * in place, since the renamed option kept its id
 * (`…/Rk9OPA/NDZhN2I2N2ItYjQ2MS00ZTMzLWExZGQtMTdlMzYxMGExYzYw`), so every row
 * holding it kept its value — and the transitional entry came out with it.
 *
 * Reading an older export that still says `Byzantine` is a separate concern and
 * still works: the permanent alias lives in TRADITIONS above, which maps it to
 * the canonical name. Read and write are deliberately not the same list.
 */
export const NOTION_TRADITIONS = [
  'Early Church',
  'Patristic',
  'Imperial',
  'Oriental Orthodox',
  'Eastern Orthodox',
  'Roman Catholic',
  'Anglican',
  'Reformed',
  'Lutheran',
  'Ecumenical',
] as const;

/** Canonical era names + Supabase aliases. Era is derived, never proposed. */
export const ERAS: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'Apostolic', aliases: ['apostolic'] },
  { canonical: 'Ante-Nicene', aliases: ['ante-nicene'] },
  { canonical: 'Nicene & Post-Nicene', aliases: ['nicene-post-nicene'] },
  { canonical: 'Early Medieval', aliases: ['early-medieval'] },
  { canonical: 'High Medieval', aliases: ['high-medieval'] },
  { canonical: 'Late Medieval', aliases: ['late-medieval'] },
  { canonical: 'Reformation', aliases: ['reformation'] },
  { canonical: 'Post-Reformation', aliases: ['post-reformation'] },
  { canonical: 'Modern', aliases: ['modern'] },
];

export const NOTION_ERAS = ERAS.map((e) => e.canonical);

/** Genre options that exist on the Notion Content Prospect List. */
export const NOTION_GENRES = [
  'Homily', 'Sermon', 'Letter', 'Treatise', 'Essay', 'Meditation', 'Rule',
  'Prayer', 'Catechesis', 'Commentary', 'Dialogue', 'Hymn', 'Poem', 'Confession',
  'Hagiography', 'Apology', 'Exegesis',
] as const;

// ---------------------------------------------------------------------------
// Scoring / threshold. Score = Value / (Complexity + Effort), range ~0.17–1.5.
// The threshold is on that Score. Accepted agent rows in the corrected batch
// bottom out at 0.5 (e.g. Value 3 / Complexity 3 / Effort 3), so 0.5 is the cut.
// ---------------------------------------------------------------------------

export const SCORING = {
  threshold: 0.5,
} as const;

/** Default per-run proposal cap. Ten good ones beats sixty at once. */
export const DEFAULT_MAX_PROPOSALS = 10;

/**
 * The provisional Status written on every agent row. Deliberately NOT one of
 * the human statuses — Notion auto-creates this option on first use, and it is
 * the review gate: agent proposals land flagged.
 */
export const PROVISIONAL_STATUS = 'Proposed — agent';

/** Statuses that read as decided — the hook only ever writes PROVISIONAL_STATUS. */
export const FORBIDDEN_STATUSES = ['Text available', 'In progress', 'Live'];

export const GENERATED_BY = 'scout-agent v0.1';

/** The copyright safe-harbour cutoff: propose only pre-1900 (or unknown) deaths. */
export const COPYRIGHT_CUTOFF_YEAR = 1900;

// ---------------------------------------------------------------------------
// Seed list (config hook only — do not scrape). Left empty for v0.
// ---------------------------------------------------------------------------

export const SEED_PRIORITIES: Array<{ author?: string; work?: string; note?: string }> = [];

// ---------------------------------------------------------------------------
// Notion write mapping — logical contract fields → live property names.
// ---------------------------------------------------------------------------

export const NOTION = {
  dataSourceId: process.env.SCOUT_NOTION_DATA_SOURCE_ID || 'e3236509-a018-494c-93cf-9a035f3d10a8',
  apiVersion: process.env.SCOUT_NOTION_VERSION || '2025-09-03',
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
    score: 'Score', // read-only formula — NEVER written
    referenceUrl: 'Reference URL',
    editorialNotes: 'Editorial notes',
    translationNotes: 'Translation notes',
  },
} as const;

// ---------------------------------------------------------------------------
// Models — Sonnet 5 for the Scout's reasoning. Overridable via env for pinning.
// ---------------------------------------------------------------------------

export const MODELS = {
  scout: process.env.SCOUT_MODEL || 'claude-sonnet-5',
  formatting: process.env.SCOUT_FORMATTING_MODEL || 'claude-haiku-4-5-20251001',
} as const;

/**
 * The provenance caveat stamped literally into every proposal's Translation
 * notes. States the suggestion is unverified and requires editorial confirmation.
 */
export const PROVENANCE_CAVEAT =
  'UNVERIFIED agent proposal. Source, copyright status, and translation provenance are ' +
  'triage hints only and require editorial confirmation before any sourcing or import.';
