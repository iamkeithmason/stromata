/**
 * review-drafts.mjs — the pure decisions behind generate-review-drafts.mjs.
 *
 * Split out from the script so the expensive failure modes are testable
 * without an API key or a database: the script runs over 316 drafts and spends
 * real money, so "which rows does it touch" and "what did that cost" are the
 * two things that must not be wrong. Everything here is a pure function over
 * plain rows; all I/O stays in the script.
 */

/**
 * Texts needing an introduction generated.
 *
 * Default: only those with no note_draft at all (4 of 316 at time of writing).
 * `force`: every text in scope — used when the note prompt itself has changed.
 */
export function selectNoteTargets(texts, { force = false } = {}) {
  return texts.filter((t) => (force ? true : !isFilled(t.note_draft)));
}

/**
 * Texts needing a summary generated.
 *
 * A live `summary` counts as present: the queue shows it and the publish path
 * prefers it, so generating a draft alongside it would be spend with no
 * reader. Whitespace-only values count as absent — a summary of "  " would
 * otherwise block generation forever and then fail the publish gate.
 */
export function selectSummaryTargets(texts, { force = false } = {}) {
  return texts.filter((t) =>
    force ? true : !isFilled(t.summary) && !isFilled(t.summary_draft)
  );
}

/** Collections needing a description generated, on the same rule. */
export function selectDescriptionTargets(collections, { force = false } = {}) {
  return collections.filter((c) =>
    force ? true : !isFilled(c.description) && !isFilled(c.description_draft)
  );
}

/**
 * Which source a text's summary should be written from.
 *
 * The note_draft is ~800 characters of prose already distilled from this exact
 * text, so summarising it costs a fraction of summarising a 30,000-word body
 * and reads no worse. The body is the fallback for a text whose note
 * generation failed or was cut off by --limit; `null` means skip, because a
 * summary written from neither would be invented.
 */
export function summarySourceFor(text) {
  if (isFilled(text.note_draft)) return { source: text.note_draft, from: 'note_draft' };
  if (isFilled(text.body)) return { source: text.body, from: 'body' };
  return { source: null, from: 'none' };
}

/** Per-million-token prices. Overridable so a price change is a one-line edit. */
export const PRICES = {
  'claude-opus-4-7': { input: 5.0, output: 25.0 },
  'claude-opus-5': { input: 5.0, output: 25.0 },
  'claude-sonnet-5': { input: 2.0, output: 10.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
};

/**
 * Turn accumulated per-model token counts into printable lines plus a total.
 *
 * A model with no price on file is reported with its token counts and excluded
 * from the total, rather than silently costed at zero — an understated bill is
 * worse than an obviously incomplete one.
 *
 * @param {Map<string, {inputTokens: number, outputTokens: number}>} spend
 * @returns {{ lines: string[], total: number, unpriced: string[] }}
 */
export function costReport(spend, prices = PRICES) {
  const lines = [];
  const unpriced = [];
  let total = 0;

  for (const [model, { inputTokens, outputTokens }] of spend) {
    const price = prices[model];
    if (!price) {
      unpriced.push(model);
      lines.push(
        `${model}: ${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out — no price on file`
      );
      continue;
    }
    const cost = (inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output;
    total += cost;
    lines.push(
      `${model}: ${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out ` +
      `— $${cost.toFixed(4)} (at $${price.input}/$${price.output} per MTok)`
    );
  }

  return { lines, total, unpriced };
}

/** A field counts as filled only if it has non-whitespace content. */
function isFilled(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
