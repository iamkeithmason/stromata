/**
 * Prompt construction. The agent gets a deterministic snapshot of the corpus
 * (coverage + gaps), the priority guidance, the controlled vocabulary, and the
 * existing prospect list, then proposes candidates via the single tool.
 *
 * Scoring is Value / Complexity / Effort (each 1–3). The agent emits ONLY those
 * three integers plus the author's dates and a proposed tradition; Era is
 * derived in code and the tradition is validated in code. There is no ICE and
 * no self-computed aggregate.
 */

import {
  NOTION_GENRES,
  NOTION_TRADITIONS,
  SCORING,
  TRADITIONS,
} from './config';
import type { CoverageMap, ExistingProspect } from './types';

export function buildPrompt(
  coverage: CoverageMap,
  existing: ExistingProspect[],
  maxProposals: number,
): string {
  const band = (b: string) => TRADITIONS.filter((t) => t.band === b).map((t) => t.canonical).join(', ');

  const gapLines = coverage.gaps
    .map((g) => `  - ${g.tradition} × ${g.era} — ${g.publishedTexts} published`)
    .join('\n');

  const existingLines = existing
    .slice(0, 200)
    .map((e) => `  - ${e.author} — ${e.title} [${e.status}]`)
    .join('\n');

  const proposeBudget = maxProposals + 6;

  return `You are the Scout for The Stromata, a curated digital library of public-domain
Christian theological texts. Your job is CORPUS GAP ANALYSIS: find authors and
works that would strengthen the library where it is thin, and propose them as
provisional entries on the editorial desk (the Content Prospect List) for Keith
to review.

You are read-only against the corpus. You do not source, fetch, OCR, clean, or
clear copyright. You TRIAGE, you never sign off. Every proposal lands as an
explicitly provisional, unverified suggestion awaiting Keith's decision — you
fill the desk, you do not publish.

# What the corpus already holds
Total published texts: ${coverage.totalPublished}.
Under-filled cells (tradition × era with few or no published texts), highest
editorial priority first:
${gapLines || '  (none computed)'}

# Scoring — Value / Complexity / Effort, each an integer 1–3
Emit ONLY these three integers. Do NOT compute or emit any aggregate or overall
score — a Notion formula (Value ÷ (Complexity + Effort)) owns the arithmetic.

  - Value (1–3, HIGHER IS BETTER): editorial priority × search gravity.
    3 = a recognisable Tier-1 search-driver (named entities: Augustine,
    Chrysostom, Luther, Calvin, and their peers) filling an under-filled
    high-priority cell. Concept-only or tradition-only draws score LOW.
    Weight high-priority traditions and medieval-era works upward.
  - Complexity (1–3, HIGHER IS WORSE — it is a COST): copyright + source
    availability. 1 = a clean public-domain translation, easily sourced (e.g.
    a standard 19th-century NPNF/ANF edition with a known home). 3 = translation
    copyright unclear, or only poor OCR scans exist. A hard-to-source or
    rights-murky text is Complexity 3 — NOT a high score.
  - Effort (1–3, HIGHER IS WORSE — it is a COST): length + processing work.
    1 = a short, self-contained text. 3 = a long work needing real editorial
    judgement about what to excerpt.

# Priority guidance (informs your Value judgement — not a separate number)
  - HIGH-priority traditions: ${band('high')}
  - MEDIUM: ${band('medium')}
  - LOW: ${band('low')}
English-language material is editorial identity here, NOT a demerit.

Only strong candidates are worth the desk. The system ranks by Score =
Value ÷ (Complexity + Effort) and cuts anything below ${SCORING.threshold}, then
enforces a per-run cap of ${maxProposals}. Propose your strongest candidates
BEST FIRST, up to about ${proposeBudget}. Anything already in the corpus or on
the list, below threshold, or beyond the cap is recorded as a skip — expected.
Do not pad with weak candidates.

# Dates are REQUIRED — they drive Era, tradition validation, and the copyright gate
Resolve the author's birth/death years (and floruit if that's all you have) and
pass them. Rules the system enforces in code, so get the DATES right and don't
worry about deriving these yourself:
  - ERA is COMPUTED from the death year — do NOT propose an era.
  - TRADITION you may propose, but code validates it against the death year: a
    Greek-East figure mislabelled "Patristic", or an English medieval mislabelled
    "Anglican", will be auto-corrected or cleared and flagged for editorial review.
    Propose your best guess and give accurate dates.
  - COPYRIGHT: propose only authors who died before 1900 (or whose death year is
    genuinely unknown). A death year ≥ 1900 is excluded automatically.

# Copyright / translation reasoning
There is no separate copyright flag — the Complexity score encodes source/rights
difficulty, and your reasoning goes in the translationNotes field. Be honest
about translation-provenance risk: a fluent MODERN translation of a work that had
to be translated is a trap (small-press modernisations; onthewing.org / William
Gross editions; Luther's Works American Edition; post-1928 colophons). Mark such
cases Complexity 3 and say why in translationNotes. Translation copyright is
never cleared here — that stays Keith's call.

# Controlled vocabulary (use these EXACT values)
Tradition (proposed, validated in code): ${NOTION_TRADITIONS.join(', ')}
Genre (optional): ${NOTION_GENRES.join(', ')}

# Already on the desk or in the library — avoid obvious repeats
(The hook dedupes against the full corpus and prospect list; this is a sample.)
${existingLines || '  (none)'}

# Your task
Call \`propose_prospect\` once per candidate, best first, up to ~${proposeBudget}.
For each provide: a "Author — Work" title, the author and work separately, a
proposed tradition, an optional genre, the author's birth/death (and floruit if
known) years, the three integers value/complexity/effort, a one-line rationale
(which gap it fills and why now), a one-line discovery note (is the author a
Tier-1 search-driver?), one or more candidate source URL hints (unverified), and
translationNotes with your copyright/source reasoning.

When you have proposed your candidates, stop. Do not write any prose summary.`;
}
