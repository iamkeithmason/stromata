/**
 * sections.mjs — editorial sections for long texts that have no headings.
 *
 * A long text with headings gets a contents list on the reader page. A long
 * text without them (Chrysostom's *Address on Vainglory*: 90 paragraphs, the
 * turn to raising children at paragraph 16) gets nothing, so a reader cannot
 * find the half they came for. Sections are an editor's division of such a
 * text: a few short labels, each starting at a paragraph. They are drafted by
 * Claude into `texts.sections_draft`, edited and approved by Keith in
 * /admin/review/sections, and copied to `texts.sections` on approval.
 *
 * Sections are NOT part of the original text (Keith, 29 Oct 2026). The stored
 * document says so (`source: 'editorial'`), so whatever renders them can set
 * them apart from the author's own headings.
 *
 * Everything here is pure and shared: the drafting script, the admin review
 * page and its API route all call these functions, so the three cannot
 * disagree about what a paragraph is or where a section starts.
 *
 * Anchors are text, not numbers. A section stores the opening words of the
 * paragraph it starts at (`starts_with`), derived from the body by
 * `anchorFor`, never typed by a person or a model. Paragraph numbers shift
 * when a body is edited; an anchor either still finds its paragraph or fails
 * loudly (`resolvePicks` reports it), which is the behaviour a reviewer needs.
 */

/** A text at or above this length is "long" (about 45 minutes at 200 wpm). Keith, 29 Oct 2026. */
export const LONG_TEXT_WORDS = 9000;

/**
 * The reader page shows a contents list when a body has at least this many
 * headings (`hasToc` in app/texts/[slug]/page.tsx). Fewer, and the text has no
 * contents today, which is what makes it need sections.
 */
export const MIN_CONTENTS_HEADINGS = 3;

export const MIN_SECTIONS = 2;
export const MAX_SECTIONS = 10;
export const MAX_LABEL = 60;

/**
 * Headings as the reader counts them: lines of one to three `#` with text left
 * after inline markdown is stripped. Mirrors `extractHeadings` in
 * lib/headings.ts (TypeScript, so a plain-node script cannot import it);
 * sections.test.mjs runs both over the same bodies and requires the same count.
 */
export function countHeadings(body) {
  let n = 0;
  for (const line of String(body ?? '').split('\n')) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) continue;
    if (stripInlineMarkdown(match[2])) n++;
  }
  return n;
}

function stripInlineMarkdown(text) {
  return text
    .replace(/\\([\\`*_{}\[\]()#+\-.!|])/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

/** The definition: long, and no contents list on the reader page today. */
export function needsSections({ word_count, body }) {
  return (word_count ?? 0) >= LONG_TEXT_WORDS && countHeadings(body) < MIN_CONTENTS_HEADINGS;
}

/**
 * Postgres regex matching a body with at least MIN_CONTENTS_HEADINGS heading
 * lines. Lets a script pre-filter on the server (`not.match`) so it never
 * downloads the bodies of long texts that already have contents. A prefilter
 * only: the fetched body is still confirmed with `needsSections`.
 */
export const HAS_CONTENTS_PATTERN = Array.from(
  { length: MIN_CONTENTS_HEADINGS },
  () => '(^|\\n)#{1,3}[ \\t]+[^\\s]'
).join('[\\s\\S]*');

/**
 * Which texts to draft sections for: those that need them and have no draft
 * yet (or every one that needs them, with `force`). Rows must carry `body`,
 * `word_count` and `sections_draft`.
 */
export function selectSectionTargets(rows, { force = false } = {}) {
  return rows.filter((r) => needsSections(r) && (force || !r.sections_draft));
}

// ── Paragraphs ───────────────────────────────────────────────────────────────

/** The body's paragraphs: blocks separated by blank lines, in order. */
export function bodyBlocks(body) {
  return String(body ?? '')
    .split(/\n[ \t]*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * A paragraph's text with markup removed, for matching: no list number ("16. "),
 * no emphasis or link syntax, single spaces. Whatever renders sections later
 * must match anchors with this same function.
 */
export function blockKey(text) {
  return stripInlineMarkdown(
    String(text ?? '')
      .replace(/^\s*(\d+[.)]|[-*+]|>)\s+/, '')
      .replace(/[*_`]/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const ANCHOR_MIN_WORDS = 6;

/**
 * The opening words that pick out paragraph `index` and no other: six words,
 * lengthened until no other paragraph starts the same way.
 */
export function anchorFor(blocks, index) {
  const keys = blocks.map(blockKey);
  const words = keys[index].split(' ');
  for (let n = Math.min(ANCHOR_MIN_WORDS, words.length); n <= words.length; n++) {
    const anchor = words.slice(0, n).join(' ');
    if (keys.every((k, i) => i === index || !k.startsWith(anchor))) return anchor;
  }
  return keys[index];
}

/** The paragraph an anchor picks out, or -1 if none or more than one does. */
export function resolveAnchor(blocks, anchor) {
  const want = blockKey(anchor);
  if (!want) return -1;
  let found = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (blockKey(blocks[i]).startsWith(want)) {
      if (found !== -1) return -1;
      found = i;
    }
  }
  return found;
}

// ── Picks ↔ the stored document ──────────────────────────────────────────────
//
// A "pick" is what people and models handle: { label, paragraph } with a
// 0-based paragraph index. The stored document is what the database keeps:
// { source: 'editorial', sections: [{ label, starts_with }] }.

/** Problems with a set of picks, as sentences. Empty means valid. */
export function validatePicks(picks, blockCount) {
  const errors = [];
  if (!Array.isArray(picks)) return ['Sections must be a list.'];
  if (picks.length < MIN_SECTIONS) errors.push(`Use at least ${MIN_SECTIONS} sections.`);
  if (picks.length > MAX_SECTIONS) errors.push(`Use at most ${MAX_SECTIONS} sections.`);
  let previous = -1;
  picks.forEach((p, i) => {
    const n = i + 1;
    const label = typeof p?.label === 'string' ? p.label.trim() : '';
    if (!label) errors.push(`Section ${n} has no title.`);
    else if (label.length > MAX_LABEL) errors.push(`Section ${n}'s title is ${label.length} characters; the limit is ${MAX_LABEL}.`);
    const at = p?.paragraph;
    if (!Number.isInteger(at) || at < 0 || at >= blockCount) {
      errors.push(`Section ${n} starts at a paragraph that does not exist.`);
    } else if (at <= previous) {
      errors.push(`Section ${n} must start after section ${n - 1}.`);
    } else {
      previous = at;
    }
  });
  return errors;
}

/** Valid picks → the stored document, with anchors derived from the body. */
export function buildSectionsDoc(blocks, picks) {
  return {
    source: 'editorial',
    sections: picks.map((p) => ({ label: p.label.trim(), starts_with: anchorFor(blocks, p.paragraph) })),
  };
}

/**
 * The stored document → picks against the current body. `missing` lists the
 * labels whose anchor no longer finds exactly one paragraph (the body changed),
 * so the reviewer is told rather than shown a silently wrong division.
 */
export function resolvePicks(blocks, doc) {
  const picks = [];
  const missing = [];
  for (const s of doc?.sections ?? []) {
    const paragraph = resolveAnchor(blocks, s.starts_with ?? '');
    if (paragraph === -1) missing.push(s.label);
    else picks.push({ label: s.label, paragraph });
  }
  return { picks, missing };
}

/** Same sections in the same places: used to tell an approved draft from a pending one. */
export function sameSections(a, b) {
  const x = a?.sections ?? [];
  const y = b?.sections ?? [];
  return x.length === y.length && x.every((s, i) => s.label === y[i].label && s.starts_with === y[i].starts_with);
}

// ── Drafting ─────────────────────────────────────────────────────────────────

export const SECTIONS_PROMPT = `You divide long Christian theological texts into sections for a reading library, The Stromata. The text has no headings of its own, so a reader on a phone cannot find their way around it. Your sections become its contents list.

You will be given the title, the author, an editor's introduction, and the text as numbered paragraphs (each cut to its opening words).

- Divide the WHOLE text into 3 to 8 consecutive sections that follow its real turns of subject. A turn is where the author moves to a new matter, not where a sentence repeats an idea.
- The first section starts at paragraph 1.
- Each label is 2 to 6 words, in plain modern English, naming what the section is about: "The soul as a city", "Against the theatre". No numbering, no "Part", no quotation marks, no colon-subtitles.
- Labels are an editor's signposts, not the author's words: describe, don't quote.
- Prefer fewer, truer sections over many thin ones.

Return ONLY a JSON array, no prose and no code fence: [{"label": "...", "paragraph": 1}, ...] where "paragraph" is the number of the paragraph the section starts at.`;

/** The numbered-paragraph digest sent to the model: each paragraph cut to its opening words. */
export function promptDigest(blocks, wordsPerParagraph = 50) {
  return blocks
    .map((b, i) => {
      const words = blockKey(b).split(' ');
      const cut = words.length > wordsPerParagraph ? `${words.slice(0, wordsPerParagraph).join(' ')} …` : words.join(' ');
      return `[${i + 1}] ${cut}`;
    })
    .join('\n');
}

/**
 * The model's reply → 0-based picks. Tolerates a code fence or a sentence
 * around the array; anything else throws, so a bad reply is reported, not
 * stored.
 */
export function parseDraftReply(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('reply contains no JSON array');
  const parsed = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('reply is not an array');
  return parsed.map((s) => ({ label: String(s?.label ?? ''), paragraph: Number(s?.paragraph) - 1 }));
}
