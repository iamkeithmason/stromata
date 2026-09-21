/**
 * summary-prompt.mjs — shared summary generation for The Stromata.
 *
 * One home for the summary prompt, the length guard and the self-correcting
 * retry loop, imported by every caller that writes `texts.summary`:
 *   - scripts/generate-summaries.mjs      (backfill)
 *   - scripts/repair-summaries.mjs        (heal truncated summaries)
 *   - scripts/generate-review-drafts.mjs  (pre-generation for /admin/review)
 *   - app/api/admin/texts/[id]/generate-summary/route.ts  (the edit form button)
 *
 * Extracted for the same reason note-prompt.mjs was: the first three carried
 * byte-identical copies of SUMMARY_PROMPT, trimToLength and generateSummary,
 * and the route carried a fourth in TypeScript. Four copies of a prompt is four
 * places to fix when the register is wrong, and three of them will be missed.
 *
 * The pure helper (trimToLength) takes no API and is unit-tested in
 * summary-prompt.test.mjs.
 */

// Summaries are short, high-volume and mechanical — the cheap model is the
// right one, and it is what every existing caller already pinned.
export const SUMMARY_MODEL = process.env.SUMMARY_MODEL || 'claude-haiku-4-5-20251001';

/** The published hard limit, mirrored by the DB check in the review queue UI. */
export const SUMMARY_MAX = 160;

export const SUMMARY_PROMPT = `You are writing a meta description for a text on The Stromata, a curated library of out-of-print Christian theological texts.

Write 1–2 complete sentences. Hard limit: 160 characters total — count carefully before responding. Every sentence must end with a period. If a sentence would push the total past 160 characters, write a shorter sentence instead. Never cut off mid-sentence or use ellipses.

Be descriptive and specific — tell the reader exactly what the text is and what it addresses. Do not be evaluative or promotional. Do not begin with the author's name or the title. Do not use phrases like "this important work" or "a must-read".

Return only the summary, with no preamble or explanation.`;

/**
 * The review queue's tighter brief.
 *
 * Appended to SUMMARY_PROMPT rather than replacing it, so the house register
 * stays in one place and this only narrows it. The published corpus averages
 * 126 characters; 110–140 is that average with room either side, and a single
 * sentence reads better than two in the queue's card layout on a phone.
 */
export const REVIEW_SUMMARY_GUIDANCE = `
ADDITIONAL CONSTRAINTS FOR THIS REQUEST
- Aim for 110–140 characters. This is tighter than the 160 limit above; treat 160 as the hard ceiling and 110–140 as the target.
- Write ONE sentence, not two.
- Do not open with "This text", "This treatise", "This work", "This sermon", "A collection of" or any similar pointing phrase. Start with the substance.`;

/**
 * Reduce to the longest run of whole sentences that fits within `max`.
 * Never cuts mid-sentence; only if a single sentence already exceeds `max`
 * does it fall back to a word-boundary cut, so a word is never split.
 */
export function trimToLength(text, max) {
  const clean = (text || '').trim();
  if (clean.length <= max) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [];
  let out = '';
  for (const sentence of sentences) {
    if ((out + sentence).length > max) break;
    out += sentence;
  }
  out = out.trim();
  if (out) return out;
  // No whole sentence fits — cut at the last word boundary, never mid-word.
  const slice = clean.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim();
}

/** True when a stored summary was cut short rather than ended. */
export function isTruncated(summary) {
  if (!summary) return false;
  const s = summary.trim();
  if (s.endsWith('…') || s.endsWith('...')) return true;
  return !/[.!?]$/.test(s);
}

/**
 * Generate a summary.
 *
 * If the model overshoots the limit or stops mid-sentence, hand its own draft
 * back with the exact character count and ask it to rewrite shorter. Feeding
 * the overshoot back lets the model self-correct — far more reliable than
 * silently re-trimming a hidden, ever-tighter limit, which is what produced
 * summaries cut off mid-word. Only if every attempt overshoots do we fall back
 * to a clean trim.
 *
 * `source` is whatever the caller wants the summary to be about: the body for
 * the backfill paths, the note_draft for the review queue (a note_draft is
 * ~800 characters of already-distilled editorial prose, so summarising it costs
 * a fraction of summarising a 30,000-word body and reads no worse).
 *
 * @param {{
 *   anthropic: import('@anthropic-ai/sdk').default,
 *   title: string,
 *   author: string,
 *   source: string,
 *   model?: string,
 *   maxChars?: number,
 *   extraGuidance?: string,
 *   maxAttempts?: number,
 * }} opts
 * @returns {Promise<{ summary: string, attempts: number, inputTokens: number, outputTokens: number }>}
 */
export async function generateSummary({
  anthropic,
  title,
  author,
  source,
  model = SUMMARY_MODEL,
  maxChars = SUMMARY_MAX,
  extraGuidance = '',
  maxAttempts = 4,
}) {
  const userMessage = [
    `Title: ${title}`,
    `Author: ${author}`,
    '',
    (source || '').slice(0, 3000),
  ].join('\n');

  const system = extraGuidance ? `${SUMMARY_PROMPT}\n${extraGuidance}` : SUMMARY_PROMPT;
  const conversation = [{ role: 'user', content: userMessage }];
  let fallback = '';
  let lastTrim = '';
  let inputTokens = 0;
  let outputTokens = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const message = await anthropic.messages.create({
      model,
      max_tokens: 200,
      system,
      messages: conversation,
    });
    inputTokens += message.usage?.input_tokens ?? 0;
    outputTokens += message.usage?.output_tokens ?? 0;

    const candidate = (message.content?.[0]?.text ?? '').trim();
    // Accept the model's own output whenever it fits and ends a sentence.
    if (candidate.length <= maxChars && /[.!?]$/.test(candidate)) {
      return { summary: candidate, attempts: attempt, inputTokens, outputTokens };
    }
    // Otherwise remember the best complete-sentence version seen so far.
    lastTrim = trimToLength(candidate, maxChars);
    if (/[.!?]$/.test(lastTrim) && lastTrim.length >= fallback.length) fallback = lastTrim;

    conversation.push({ role: 'assistant', content: candidate });
    conversation.push({
      role: 'user',
      content: `That draft was ${candidate.length} characters. Rewrite it as one or two complete sentences, each ending in a period, totalling ${maxChars} characters or fewer. Return only the summary.`,
    });
  }

  return { summary: fallback || lastTrim, attempts: maxAttempts, inputTokens, outputTokens };
}
