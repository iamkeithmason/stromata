/**
 * paragraphs.mjs — editorial paragraph breaks for walls of text.
 *
 * Many texts keep their source's typesetting, where a whole chapter is one
 * paragraph (the Ante-Nicene Fathers prints much of Tertullian and Origen this
 * way). On a phone that is several screens of unbroken type. A paragraph break
 * is a printer's convention, not the author's, so adding one is a legitimate
 * editorial act provided no word changes and the break is recorded as the
 * editor's (Keith, 10 Nov 2026: make it a habit, flag at 800 words).
 *
 * The flow mirrors sections (scripts/lib/sections.mjs):
 *   detect   — `paragraphStats` flags a text with a prose paragraph of 800+
 *              words; pipeline-import.mjs prints the flag, and the SQL function
 *              `paragraph_wall_stats` (migration 038) computes the same counts
 *              in the database so selection downloads no bodies.
 *   propose  — Claude reads one long paragraph at a time, as numbered
 *              sentences, and names the sentences after which the argument
 *              turns. A deterministic step turns those into anchors, stored in
 *              `texts.paragraphs_draft`. A proposal is anchors, never a body.
 *   approve  — Keith reviews at /admin/review/paragraphs; Approve inserts a
 *              blank line at each anchor (`applyBreaks`), refuses unless the
 *              result has exactly the same words as before, appends
 *              PROVENANCE_LINE to provenance_notes, and refreshes the page.
 *
 * Everything here is pure: the drafting script, the review page and its API
 * route all call these functions, so they cannot disagree about what a
 * paragraph, a sentence or a legal break is.
 *
 * Anchors are text, not offsets: `after` holds the closing words of the
 * sentence a break follows, lengthened until they occur exactly once in the
 * body. If the body is edited, an anchor either still finds its place or fails
 * loudly, the same contract as section anchors.
 */

// ── Thresholds (Keith, 10 Nov 2026) ──────────────────────────────────────────

/** A prose paragraph this long is a wall: several screens on a phone. */
export const FLAG_WORDS = 800;

/** Tiering used by the 10 Nov measurement (and the backfill order). */
export const TIER_MAX_WORDS = 1000;
export const TIER_LONG_PARAGRAPH = 300;
export const TIER_LONG_SHARE = 0.9;

/** No break may leave a piece shorter than this. */
export const MIN_PIECE_WORDS = 60;

/** What the drafting prompt aims for. Guidance, not a rule. */
export const TARGET_MIN_WORDS = 120;
export const TARGET_MAX_WORDS = 350;

/** Added to provenance_notes when breaks are applied (wording from the card). */
export const PROVENANCE_LINE =
  'Paragraph breaks added by the editor for reading; the source prints this as continuous text.';

// ── Blocks ───────────────────────────────────────────────────────────────────

const SEPARATOR = /\n[ \t]*\n/g;
// The same heading-line pattern the SQL function strips, so counts agree.
const HEADING_LINE = /(^|\n)#{1,6}[ \t][^\n]*/g;
const NOTES_HEADING = /^#{1,6}[ \t]+(foot|end)?notes[ \t]*$/im;

/** Words as the database counts them: the trimmed text split on whitespace. */
export function countWords(text) {
  const t = String(text ?? '').trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Block kind, from the block's text with heading lines removed. Only 'prose'
 * is ever broken; verse, lists, blockquotes, footnotes and anything else are
 * left exactly as they are.
 */
function kindOf(text, inNotes) {
  if (!text) return 'heading';
  if (inNotes || /^\[\^[^\]]+\]:/.test(text)) return 'footnote';
  if (/^(\d+[.)]|[-*+])[ \t]/.test(text)) return 'list';
  if (/^>/.test(text)) return 'blockquote';
  if (/^(```|~~~|\||<)/.test(text) || /^([-*_][ \t]*){3,}$/.test(text)) return 'other';
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length >= 3) {
    if (lines.every((l) => /^ {2,}\S/.test(l))) return 'verse';
    const lengths = lines.map((l) => l.trim().length).sort((a, b) => a - b);
    const mid = lengths.length >> 1;
    const median = lengths.length % 2 ? lengths[mid] : (lengths[mid - 1] + lengths[mid]) / 2;
    if (median < 60) return 'verse';
  }
  return 'prose';
}

/**
 * The body's blocks (separated by blank lines), with offsets into the body.
 * `text` is the block with heading lines removed and trimmed, which is what is
 * counted and what sentences are found in; `textStart` is its offset.
 */
export function paragraphBlocks(body) {
  const src = String(body ?? '');
  const blocks = [];
  let inNotes = false;
  let from = 0;
  const push = (start, end) => {
    const raw = src.slice(start, end);
    if (!raw.trim()) return;
    if (NOTES_HEADING.test(raw)) inNotes = true;
    const stripped = raw.replace(HEADING_LINE, (m, lead) => lead + ' '.repeat(m.length - lead.length));
    const lead = stripped.length - stripped.trimStart().length;
    const text = stripped.trim();
    blocks.push({
      start,
      end,
      textStart: start + lead,
      text,
      words: countWords(text),
      kind: kindOf(text, inNotes),
    });
  };
  for (const m of src.matchAll(SEPARATOR)) {
    push(from, m.index);
    from = m.index + m[0].length;
  }
  push(from, src.length);
  // A block that is only headings was counted as nothing; keep it out, as the
  // SQL measurement does.
  return blocks.filter((b) => b.kind !== 'heading');
}

/**
 * Tier from the three numbers the SQL function returns (or `paragraphStats`
 * computes). 1: a 1,000+ word paragraph and 90%+ of words in 300+ word
 * paragraphs. 2: a 1,000+ word paragraph. 3: one of 800–999. 0: none.
 */
export function tierFor({ max_words, total_words, long_words }) {
  if (max_words >= TIER_MAX_WORDS) {
    return long_words >= TIER_LONG_SHARE * total_words ? 1 : 2;
  }
  return max_words >= FLAG_WORDS ? 3 : 0;
}

/**
 * Per-text figures. `flagged` is true when a PROSE paragraph reaches
 * FLAG_WORDS; `walls` are the indices (into `blocks`) of those paragraphs, the
 * only ones a proposal may break. Tier figures count every block, as the
 * 10 Nov measurement did.
 */
export function paragraphStats(body) {
  const blocks = paragraphBlocks(body);
  const max_words = blocks.reduce((m, b) => Math.max(m, b.words), 0);
  const total_words = blocks.reduce((s, b) => s + b.words, 0);
  const long_words = blocks.reduce((s, b) => s + (b.words >= TIER_LONG_PARAGRAPH ? b.words : 0), 0);
  const walls = blocks.flatMap((b, i) => (b.kind === 'prose' && b.words >= FLAG_WORDS ? [i] : []));
  return {
    blocks,
    max_words,
    total_words,
    long_words,
    tier: tierFor({ max_words, total_words, long_words }),
    walls,
    flagged: walls.length > 0,
    longest: walls.reduce((m, i) => Math.max(m, blocks[i].words), 0),
  };
}

// ── Sentences ────────────────────────────────────────────────────────────────

// Words whose full stop is not a sentence end. Lower-cased, without the stop.
const ABBREVIATIONS = new Set(
  (
    'mr mrs dr st ss sts cf ch chap c cc p pp v vv ver vol vols viz i.e e.g ib ibid id op cit loc sq sqq seq ' +
    'n no nos lib art q obj rep ep epist hom serm tract ps psa pss gen ex exod lev num deut josh judg ' +
    'sam kgs chron neh esth prov eccl eccles ecclus isa jer lam ezek dan hos obad mic nah hab zeph hag ' +
    'zech mal matt mk mt lk jn rom cor gal eph phil col thess tim tit philem heb jas pet jude rev apoc ' +
    'wisd macc bar tob jud sir esd lit fol ff al vs'
  ).split(' ')
);

/**
 * Sentence ends in `text`, as offsets just past the closing punctuation (and
 * any closing quote or bracket). A full stop after an abbreviation or an
 * initial is not an end, and nothing inside an open quotation or bracket is:
 * a quoted passage of several sentences stays one unit, which is what keeps a
 * break out of a quotation.
 */
export function sentenceEnds(text) {
  const s = String(text ?? '');
  const ends = [];
  let curly = 0;
  let straight = false;
  let paren = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '“') curly++;
    else if (c === '”') curly = Math.max(0, curly - 1);
    else if (c === '"') straight = !straight;
    else if (c === '(' || c === '[') paren++;
    else if (c === ')' || c === ']') paren = Math.max(0, paren - 1);
    if (c !== '.' && c !== '!' && c !== '?') continue;

    // Take closing quotes, brackets and emphasis marks with the stop.
    let j = i + 1;
    let closeCurly = curly;
    let closeStraight = straight;
    let closeParen = paren;
    while (j < s.length && /["'”’)\]*_]/.test(s[j])) {
      if (s[j] === '”') closeCurly = Math.max(0, closeCurly - 1);
      if (s[j] === '"') closeStraight = !closeStraight;
      if (s[j] === ')' || s[j] === ']') closeParen = Math.max(0, closeParen - 1);
      j++;
    }
    if (closeCurly > 0 || closeStraight || closeParen > 0) continue;
    if (j >= s.length || !/\s/.test(s[j])) continue;
    // The next sentence opens with a capital (after any opening marks).
    let k = j;
    while (k < s.length && /\s/.test(s[k])) k++;
    while (k < s.length && /["'“‘(\[*_]/.test(s[k])) k++;
    if (k >= s.length || !/\p{Lu}/u.test(s[k])) continue;
    if (c === '.') {
      const before = s.slice(0, i).replace(/\\$/, '');
      const word = (before.match(/([\p{L}.]+)$/u)?.[1] ?? '').toLowerCase();
      if (ABBREVIATIONS.has(word) || ABBREVIATIONS.has(word.replace(/\.$/, ''))) continue;
      if (/^\p{L}$/u.test(word)) continue; // an initial: "J. Smith"
    }
    ends.push(j);
  }
  return ends;
}

/** The block's sentences as strings, in order (whitespace between them dropped). */
export function sentencesOf(text) {
  const s = String(text ?? '');
  const out = [];
  let from = 0;
  for (const end of sentenceEnds(s)) {
    out.push(s.slice(from, end).trim());
    from = end;
  }
  const rest = s.slice(from).trim();
  if (rest) out.push(rest);
  return out;
}

// ── Picks ↔ anchors ──────────────────────────────────────────────────────────
//
// A "pick" is what people and models handle: { paragraph, sentence }, 0-based,
// meaning "break after sentence `sentence` of block `paragraph`". The stored
// document is { source: 'editorial', breaks: [{ after }] } plus `held` or
// `applied_at` once Keith has acted on it.

function occurrences(body, needle) {
  let n = 0;
  let at = -1;
  for (let i = body.indexOf(needle); i !== -1; i = body.indexOf(needle, i + 1)) {
    n++;
    at = i;
    if (n > 1) break;
  }
  return { n, at };
}

const ANCHOR_MIN_WORDS = 6;
const ANCHOR_MAX_WORDS = 60;

/**
 * The closing words of the text before `offset`: six words, lengthened until
 * they occur once in the body. Null if no such run exists (a sentence repeated
 * word for word), in which case that break cannot be proposed.
 */
export function anchorAt(body, offset) {
  const before = body.slice(0, offset);
  const spans = [...before.matchAll(/\S+/g)];
  for (let n = ANCHOR_MIN_WORDS; n <= Math.min(ANCHOR_MAX_WORDS, spans.length); n++) {
    const anchor = before.slice(spans[spans.length - n].index);
    if (occurrences(body, anchor).n === 1) return anchor;
  }
  return null;
}

/** Offset in the body at which a pick's break falls. */
function pickOffset(blocks, pick) {
  const b = blocks[pick.paragraph];
  return b.textStart + sentenceEnds(b.text)[pick.sentence];
}

/** Problems with a set of picks against the body, as sentences. Empty means valid. */
export function validatePicks(body, picks) {
  if (!Array.isArray(picks)) return ['Breaks must be a list.'];
  const { blocks, walls } = paragraphStats(body);
  const errors = [];
  const seen = new Set();
  const byParagraph = new Map();
  for (const p of picks) {
    const where = `Paragraph ${Number(p?.paragraph) + 1}`;
    if (!Number.isInteger(p?.paragraph) || !walls.includes(p.paragraph)) {
      errors.push(`${where} is not a long prose paragraph, so it cannot take a break.`);
      continue;
    }
    const count = sentenceEnds(blocks[p.paragraph].text).length;
    if (!Number.isInteger(p?.sentence) || p.sentence < 0 || p.sentence >= count) {
      errors.push(`${where} has no sentence ${Number(p?.sentence) + 1} to break after.`);
      continue;
    }
    const key = `${p.paragraph}:${p.sentence}`;
    if (seen.has(key)) {
      errors.push(`${where} has the same break twice.`);
      continue;
    }
    seen.add(key);
    if (!byParagraph.has(p.paragraph)) byParagraph.set(p.paragraph, []);
    byParagraph.get(p.paragraph).push(p.sentence);
  }
  for (const [paragraph, sentences] of byParagraph) {
    for (const [i, words] of pieceWords(blocks[paragraph].text, sentences).entries()) {
      if (words < MIN_PIECE_WORDS) {
        errors.push(
          `Paragraph ${paragraph + 1}: piece ${i + 1} would be ${words} words; the minimum is ${MIN_PIECE_WORDS}.`
        );
      }
    }
  }
  if (!errors.length) {
    for (const p of picks) {
      if (!anchorAt(body, pickOffset(blocks, p))) {
        errors.push(`Paragraph ${p.paragraph + 1}: the break after sentence ${p.sentence + 1} has no unique anchor.`);
      }
    }
  }
  return errors;
}

/** Word counts of the pieces a paragraph would become, broken after `sentences`. */
export function pieceWords(text, sentences) {
  const sents = sentencesOf(text);
  const cuts = [...new Set(sentences)].sort((a, b) => a - b);
  const out = [];
  let from = 0;
  for (const cut of [...cuts, sents.length - 1]) {
    out.push(countWords(sents.slice(from, cut + 1).join(' ')));
    from = cut + 1;
  }
  return out;
}

/** Valid picks → the stored document. Throws if a pick has no anchor (validate first). */
export function buildParagraphsDoc(body, picks) {
  const { blocks } = paragraphStats(body);
  const sorted = [...picks].sort((a, b) => a.paragraph - b.paragraph || a.sentence - b.sentence);
  return {
    source: 'editorial',
    breaks: sorted.map((p) => {
      const after = anchorAt(body, pickOffset(blocks, p));
      if (!after) throw new Error(`no unique anchor for paragraph ${p.paragraph + 1}, sentence ${p.sentence + 1}`);
      return { after };
    }),
  };
}

/**
 * The stored document → picks against the current body. `missing` lists the
 * anchors that no longer find a legal place (the body changed); `applied` is
 * true when every anchor is already followed by a paragraph break.
 */
export function resolvePicks(body, doc) {
  const src = String(body ?? '');
  const { blocks, walls } = paragraphStats(src);
  const picks = [];
  const missing = [];
  let alreadyBroken = 0;
  for (const br of doc?.breaks ?? []) {
    const { n, at } = occurrences(src, br.after ?? '');
    if (n !== 1 || !br.after) {
      missing.push(br.after);
      continue;
    }
    const offset = at + br.after.length;
    if (/^[ \t]*\n[ \t]*\n/.test(src.slice(offset))) {
      alreadyBroken++;
      continue;
    }
    const paragraph = walls.find((i) => blocks[i].textStart <= offset && offset <= blocks[i].end);
    if (paragraph === undefined) {
      missing.push(br.after);
      continue;
    }
    const sentence = sentenceEnds(blocks[paragraph].text).indexOf(offset - blocks[paragraph].textStart);
    if (sentence === -1) missing.push(br.after);
    else picks.push({ paragraph, sentence });
  }
  const total = doc?.breaks?.length ?? 0;
  return { picks, missing, applied: total > 0 && alreadyBroken === total };
}

/** Same text, ignoring whitespace: the check every apply must pass. */
export function sameWords(a, b) {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  return norm(a) === norm(b);
}

/**
 * Insert a paragraph break at every anchor in the document. All or nothing:
 * throws if any anchor fails to resolve to a legal break, or if the result
 * differs from the body in anything but whitespace, or gained a number of
 * paragraph breaks other than the number asked for.
 */
export function applyBreaks(body, doc) {
  const src = String(body ?? '');
  const breaks = doc?.breaks ?? [];
  if (!breaks.length) throw new Error('No breaks to apply.');
  const { picks, missing } = resolvePicks(src, doc);
  if (missing.length || picks.length !== breaks.length) {
    throw new Error(
      `${breaks.length - picks.length} break(s) no longer match the text; nothing was changed. Redraft or edit the breaks.`
    );
  }
  const { blocks } = paragraphStats(src);
  const offsets = picks.map((p) => pickOffset(blocks, p)).sort((a, b) => b - a);
  let out = src;
  for (const at of offsets) {
    const gap = out.slice(at).match(/^\s+/)[0];
    out = `${out.slice(0, at)}\n\n${out.slice(at + gap.length)}`;
  }
  const blankLines = (s) => (s.match(SEPARATOR) ?? []).length;
  if (!sameWords(src, out) || blankLines(out) - blankLines(src) !== breaks.length) {
    throw new Error('Applying the breaks would change more than line breaks; nothing was changed.');
  }
  return out;
}

/** provenance_notes with PROVENANCE_LINE appended once. */
export function withProvenanceLine(notes) {
  const current = String(notes ?? '').trim();
  if (current.includes(PROVENANCE_LINE)) return current;
  return current ? `${current} ${PROVENANCE_LINE}` : PROVENANCE_LINE;
}

/** Where a document stands in the queue. */
export function draftState(doc) {
  if (!doc) return 'none';
  if (doc.applied_at) return 'applied';
  if (doc.held) return 'held';
  return 'pending';
}

// ── Drafting ─────────────────────────────────────────────────────────────────

export const PARAGRAPHS_PROMPT = `You add paragraph breaks to Christian theological texts for a reading library, The Stromata. The source printed this passage as one continuous paragraph; on a phone that is several screens of unbroken type. A paragraph break is a printer's convention, not the author's, so an editor may add one, but only where the text itself turns.

You will be given the title, the author and ONE long paragraph, as numbered sentences with their word counts.

- Name the sentences AFTER which a new paragraph should begin: where the author moves to a new step of the argument, a new example, an objection, an answer, or a new address to the reader.
- Aim for paragraphs of roughly ${TARGET_MIN_WORDS}–${TARGET_MAX_WORDS} words. Follow the sense, not the count: a longer paragraph is fine if the thought does not turn, and never make one shorter than ${MIN_PIECE_WORDS} words.
- Never break so that a sentence beginning "For", "But", "And" or "Therefore" is cut off from what it answers, unless it opens a genuinely new step.
- Never break inside a quotation or a list of scriptural proofs.
- If the paragraph has no real turn, return an empty array.

Return ONLY a JSON array of sentence numbers, no prose and no code fence: e.g. [4, 9, 15].`;

/** The numbered-sentence digest sent to the model for one paragraph. */
export function sentenceDigest(text) {
  return sentencesOf(text)
    .map((s, i) => `[${i + 1}] (${countWords(s)} words) ${s}`)
    .join('\n');
}

/**
 * The model's reply → 0-based sentence indices. Tolerates a code fence or a
 * sentence around the array; anything else throws, so a bad reply is reported,
 * not stored.
 */
export function parseBreaksReply(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('reply contains no JSON array');
  const parsed = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('reply is not an array');
  return parsed.map((n) => Number(n) - 1);
}

/**
 * Turn a model's sentence indices for one paragraph into legal picks: drop
 * anything out of range or repeated, then drop breaks (latest first) until no
 * piece is under MIN_PIECE_WORDS. Deterministic, so a reply can only ever
 * narrow to something valid, never be stretched into something it did not say.
 */
export function tidyBreaks(text, indices) {
  const count = sentencesOf(text).length;
  let cuts = [...new Set(indices.filter((n) => Number.isInteger(n) && n >= 0 && n < count - 1))].sort((a, b) => a - b);
  for (;;) {
    const pieces = pieceWords(text, cuts);
    const short = pieces.findIndex((w) => w < MIN_PIECE_WORDS);
    if (short === -1 || cuts.length === 0) return cuts;
    // A short piece is bounded by cuts[short - 1] and cuts[short]; drop the later bound if it exists.
    cuts = cuts.filter((_, i) => i !== Math.min(short, cuts.length - 1));
  }
}

/**
 * Which texts to draft for, from rows shaped like the SQL function's output
 * (`max_words`, `total_words`, `long_words`, `published`, `has_draft`).
 * Unpublished texts are drafted whatever their tier (the standing habit for
 * new imports); published ones in tier order, up to `maxTier`.
 */
export function selectParagraphTargets(rows, { maxTier = 1, force = false, slug = null } = {}) {
  return rows.filter((r) => {
    const tier = tierFor(r);
    if (tier === 0) return false;
    if (!force && r.has_draft) return false;
    if (slug) return r.slug === slug;
    return !r.published || tier <= maxTier;
  });
}
