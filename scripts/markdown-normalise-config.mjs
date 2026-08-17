/**
 * markdown-normalise-config.mjs
 * Configuration for normalise-markdown.mjs.
 *
 * `heuristics` tune the verse detector (see normalise-markdown.mjs). `overrides`
 * lets you force a single file's classification when the heuristics get it wrong.
 *
 * Override keys are the file's basename without the `.md` extension — which, for
 * pipeline output, is the same as the text's frontmatter `slug`. Two flags are
 * supported per key:
 *   - treatAllAsVerse: true  → never insert paragraph breaks; protect every line
 *                              (use for hymnals, psalters, poetry collections).
 *   - treatAllAsProse: true  → never flag verse; apply prose spacing throughout
 *                              (use when a prose work trips the verse heuristic).
 */

export default {
  heuristics: {
    // A run of 3+ non-blank lines is verse-candidate when its median line length
    // is under this many characters AND fewer than terminalPunctuationRatio of
    // its lines end in sentence-terminal punctuation.
    maxMedianLineLength: 60,
    terminalPunctuationRatio: 0.6,
  },
  overrides: {
    // 'george-herbert-the-temple': { treatAllAsVerse: true },
    // 'augustine-confessions': { treatAllAsProse: true },
  },
};
