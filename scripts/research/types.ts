/**
 * Shared types for the provenance assistant — an ADVISORY tool that reads a
 * candidate source page and returns a SAFE/HOLD copyright verdict with evidence,
 * to pre-fill the editor's judgement. It never writes Notion or the database and
 * never sets `Rights cleared` — the copyright DECISION stays with the human; this
 * only does the research.
 */

export type Verdict = 'SAFE' | 'HOLD';
export type Confidence = 'high' | 'medium' | 'low';

/** The structured assessment the model returns for a candidate source. */
export interface ProvenanceAssessment {
  /** The work and its original author, as identified from the page. */
  work: string;
  author: string;
  /** The English translation's provenance, best-effort from the page + knowledge. */
  translator: string | null;
  /** Series / edition, e.g. "Nicene and Post-Nicene Fathers, Second Series, Vol. 9". */
  edition: string | null;
  publisher: string | null;
  /** Publication year of THIS edition — the decisive fact for US public domain. */
  publicationYear: number | null;
  translatorDeathYear: number | null;
  /** A distinctive verbatim phrase from the body, to fingerprint the translation. */
  distinctivePhrase: string | null;
  /** Which known edition the phrase/register matches (if identifiable). */
  matchedEdition: string | null;
  /** SAFE only when a concrete public-domain basis is present; else HOLD. */
  verdict: Verdict;
  confidence: Confidence;
  /** One-paragraph reasoning for the verdict. */
  reasoning: string;
  /** Any specific in-copyright edition this might be (the trap to avoid), or null. */
  copyrightRisk: string | null;
  /** A paste-ready `Translation notes` line for the prospect. */
  translationNotes: string;
}

/** The full result printed to the operator: the assessment + source context. */
export interface ResearchResult {
  url: string;
  host: string;
  /** True when the host is directly pinnable by the Sourcer (on its allowlist). */
  allowlisted: boolean;
  fetchedBytes: number;
  assessment: ProvenanceAssessment;
}
