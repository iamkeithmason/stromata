/**
 * dewittenberg-blockquote.mjs — un-nest Project Wittenberg's indentation-only
 * blockquotes and drop the underscore-rule divider glued into real content.
 *
 * Project Wittenberg's older catechetical pages (the Small Catechism, the 95
 * Theses) wrap their Q&A content in `<blockquote><blockquote>` purely for
 * visual indentation — never for an actual quotation — which turndown
 * renders as a `> > ` prefix on every line. `scripts/lib/source-chrome.mjs`
 * can't touch this: its rules drop whole blocks, and here the markers run
 * through content that has to stay. Same story for the underscore-rule
 * divider (`\_\_\_\_\_\_\_\_\_\_`) where it survives glued onto a real
 * heading or citation with no blank line to split it into its own block —
 * `wittenberg-underscore-rule` correctly leaves those alone rather than risk
 * the content beside them.
 *
 * This is deliberately a separate, narrow function rather than a
 * CHROME_RULES entry — it edits *inside* surviving blocks, which
 * source-chrome.mjs's whole-block model is built not to do. Judged safe
 * per-text by Keith (2026-09-21): on these pages `>` never introduces a real
 * quotation, so stripping it costs nothing.
 */
export function dewittenbergBlockquote(markdown) {
  if (!markdown) return markdown ?? '';
  return markdown
    // One or more ">" (optionally followed by a single space) at the start
    // of a line — covers both the single- and double-nested cases turndown
    // produces ("> " on the 95 Theses, "> > " on the catechism).
    .replace(/^(?:>\s?)+/gm, '')
    // A run of 6+ turndown-escaped underscores, wherever it sits — the
    // site's other divider idiom, surviving here specifically because it was
    // glued to real content and so never became its own block. The optional
    // leading newline is consumed with it so a divider on its own line
    // (glued only to what follows, e.g. a closing "**") doesn't leave a
    // dangling blank line behind.
    .replace(/\n?(?:\\_){6,}/g, '')
    // A divider that WAS its own block (blank line before and after) still
    // leaves a doubled blank line once its line is gone — collapse any run
    // of 3+ newlines down to one blank line, same as everywhere else in the
    // corpus.
    .replace(/\n{3,}/g, '\n\n');
}
