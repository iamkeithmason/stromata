/**
 * The provenance assessment — hand the candidate page to Claude and get back a
 * structured SAFE/HOLD verdict with its evidence. The model does the RESEARCH
 * (identify the translation, its edition and year, fingerprint it); the human
 * still makes the copyright DECISION. Defaults to HOLD whenever the basis is not
 * concrete — the safe direction.
 *
 * `coerceAssessment` (pure) normalises the model's raw tool input into a
 * ProvenanceAssessment and is unit-tested without an API key.
 */

import Anthropic from '@anthropic-ai/sdk';
import { MODEL, MAX_TOKENS, MAX_ASSESS_CHARS, US_PD_PUBLICATION_CUTOFF } from './config';
import type { CandidatePage } from './fetch';
import type { Confidence, ProvenanceAssessment, Verdict } from './types';

const SYSTEM = `You are a provenance-and-copyright RESEARCH assistant for The Stromata, a
library of PUBLIC-DOMAIN historical Christian texts. Given the text of a candidate
source page, identify the work, its English translation, and whether that
translation is public domain — then return a SAFE or HOLD verdict.

You do NOT make the final copyright decision; a human does. Your job is to hand
them an accurate, evidence-backed assessment. Be conservative: when the basis is
not concrete, return HOLD.

Rules for the verdict:
- The decisive fact for US public domain is the PUBLICATION YEAR of THIS edition:
  a translation PUBLISHED before ${US_PD_PUBLICATION_CUTOFF} is public domain
  regardless of when the translator later died. If the page states a pre-${US_PD_PUBLICATION_CUTOFF}
  publication (e.g. a source line like "NPNF Second Series Vol. 9 ... 1899"), that
  is SAFE — say so and cite the line.
- An original English composition by an author who died before 1900 is SAFE (no
  translation-copyright risk).
- A standard 19th-century scholarly translation (NPNF / ANF / the Christian
  Literature Publishing Co. Schaff editions, with their characteristic inline
  Scripture citations) is SAFE.
- A fluent MODERN translation of a work that had to be translated is a TRAP → HOLD.
  Known risks: small-press modernisations; onthewing.org / William Gross editions;
  Luther's Works American Edition (Fortress/Concordia); the Fathers of the Church
  series (Catholic University of America Press, e.g. Chase's 1958 John of Damascus);
  Popular Patristics (SVS Press); any post-1928 colophon.
- Register alone is NOT decisive — a KJV-style Scripture quotation can sit inside a
  modern translation. Prefer a VERBATIM phrase from the translator's own prose and
  say which named, dated edition it matches.
- If you cannot establish a concrete public-domain basis, return HOLD and name the
  specific in-copyright edition you suspect (or say none could be confirmed).

Return your assessment ONLY by calling the record_assessment tool.`;

const TOOL = {
  name: 'record_assessment',
  description: 'Record the structured provenance assessment for the candidate source.',
  input_schema: {
    type: 'object' as const,
    properties: {
      work: { type: 'string' },
      author: { type: 'string' },
      translator: { type: ['string', 'null'] },
      edition: { type: ['string', 'null'], description: 'Series / volume / edition.' },
      publisher: { type: ['string', 'null'] },
      publicationYear: { type: ['number', 'null'] },
      translatorDeathYear: { type: ['number', 'null'] },
      distinctivePhrase: { type: ['string', 'null'], description: 'A verbatim phrase from the body prose.' },
      matchedEdition: { type: ['string', 'null'] },
      verdict: { type: 'string', enum: ['SAFE', 'HOLD'] },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      reasoning: { type: 'string' },
      copyrightRisk: { type: ['string', 'null'], description: 'Suspected in-copyright edition, or null.' },
      translationNotes: { type: 'string', description: 'A paste-ready Translation notes line.' },
    },
    required: ['work', 'author', 'verdict', 'confidence', 'reasoning', 'translationNotes'],
  },
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function strOrNull(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
}
function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalise the model's raw tool input into a ProvenanceAssessment. Pure. */
export function coerceAssessment(raw: Record<string, unknown>): ProvenanceAssessment {
  // Default to the SAFE direction only when the model explicitly said SAFE.
  const verdict: Verdict = str(raw.verdict).toUpperCase() === 'SAFE' ? 'SAFE' : 'HOLD';
  const confRaw = str(raw.confidence).toLowerCase();
  const confidence: Confidence = confRaw === 'high' || confRaw === 'medium' || confRaw === 'low' ? (confRaw as Confidence) : 'low';
  return {
    work: str(raw.work) || '(unidentified work)',
    author: str(raw.author) || '(unidentified author)',
    translator: strOrNull(raw.translator),
    edition: strOrNull(raw.edition),
    publisher: strOrNull(raw.publisher),
    publicationYear: numOrNull(raw.publicationYear),
    translatorDeathYear: numOrNull(raw.translatorDeathYear),
    distinctivePhrase: strOrNull(raw.distinctivePhrase),
    matchedEdition: strOrNull(raw.matchedEdition),
    verdict,
    confidence,
    reasoning: str(raw.reasoning) || '(no reasoning given)',
    copyrightRisk: strOrNull(raw.copyrightRisk),
    translationNotes: str(raw.translationNotes) || '',
  };
}

/** Call Claude to assess the candidate page. Requires ANTHROPIC_API_KEY. */
export async function assessProvenance(page: CandidatePage): Promise<ProvenanceAssessment> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set — the provenance assistant cannot run.');
  }
  const client = new Anthropic();
  const body = page.text.slice(0, MAX_ASSESS_CHARS);
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [
      {
        role: 'user',
        content:
          `Candidate source URL: ${page.url}\n\n` +
          `Assess the provenance and public-domain status of the translation on this page. ` +
          `Page text (may be truncated):\n\n${body}`,
      },
    ],
  });
  const toolUse = message.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('model did not return a structured assessment');
  }
  return coerceAssessment(toolUse.input as Record<string, unknown>);
}
