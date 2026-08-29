/**
 * Provenance-assistant configuration. Deliberately small — this is a read-only
 * advisory tool. It reuses the Sourcer's source allowlist as the single source
 * of truth for "is this host directly pinnable" (imported, not duplicated).
 */

// The US public-domain bright line the assistant reasons against: a work (or
// translation) PUBLISHED before this year is public domain regardless of the
// author's/translator's later death. Used as guidance in the prompt, not a gate.
export const US_PD_PUBLICATION_CUTOFF = 1929;

/** Hard ceiling on a candidate fetch, in bytes. */
export const MAX_FETCH_BYTES = Number(process.env.RESEARCH_MAX_FETCH_BYTES) || 5 * 1024 * 1024;

/** How much of the page body to hand the model (chars). Enough to fingerprint. */
export const MAX_ASSESS_CHARS = Number(process.env.RESEARCH_MAX_ASSESS_CHARS) || 24_000;

/** Reasoning model — provenance is high-stakes; default to a capable model. */
export const MODEL = process.env.RESEARCH_MODEL || 'claude-sonnet-5';

export const MAX_TOKENS = Number(process.env.RESEARCH_MAX_TOKENS) || 1500;
