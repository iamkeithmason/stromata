/**
 * djvu-layout.mjs — read an Archive.org `_djvu.xml` as pages of positioned
 * lines, and tell page furniture from text by where it sits on the page.
 *
 * WHY THIS EXISTS, and it is the whole point: `_djvu.txt` is a lossy
 * flattening of `_djvu.xml`. Both carry the same OCR, but the XML keeps the
 * LINE elements and every word's bounding box, and the .txt throws them away.
 * On the 1743 Psychomachia that loss was not cosmetic — in the .txt, verse
 * lines were merged two-to-a-line, run-overs were orphaned, page numbers were
 * spliced into the middle of couplets, and on at least one page the lines came
 * out in the wrong ORDER. Every one of those is structure the XML still has.
 *
 * So: for any scan where layout carries meaning — verse, drama, columns,
 * anything with catchwords or marginalia — read the XML. The .txt is fine for
 * a wall of prose and misleading for everything else.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not improve the OCR. A word the
 * scanner read wrong is read wrong here too; this recovers the arrangement,
 * not the letters. Word confidences come through so a caller can flag the
 * doubtful ones for a human rather than shipping them silently.
 *
 * Pure — no I/O, no config file, no network. The CLI half lives in
 * scripts/ingestion/extract-djvu-xml.mjs.
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, n) => ENTITIES[n]);
}

/**
 * Parse the XML into pages of lines.
 *
 * DjVu hidden-text coords are `left, bottom, right, top` with y growing
 * DOWNWARD in Archive's derivatives, so `bottom >= top` numerically. We
 * normalise to y0 (upper edge) / y1 (lower edge) here and never think about
 * it again.
 */
export function parseDjvuXml(xml) {
  const pages = [];
  for (const object of xml.split('<OBJECT').slice(1)) {
    const dim = /width="(\d+)"\s+height="(\d+)"/.exec(object);
    const lines = [];
    for (const lineMatch of object.matchAll(/<LINE>([\s\S]*?)<\/LINE>/g)) {
      const words = [];
      for (const w of lineMatch[1].matchAll(
        /<WORD coords="([^"]+)"(?:\s+x-confidence="(\d+)")?\s*>([\s\S]*?)<\/WORD>/g,
      )) {
        const [left, bottom, right, top] = w[1].split(',').map(Number);
        const text = decodeEntities(w[3]);
        if (!text.trim()) continue;
        words.push({
          text,
          x0: left,
          x1: right,
          y0: Math.min(top, bottom),
          y1: Math.max(top, bottom),
          conf: w[2] === undefined ? null : Number(w[2]),
        });
      }
      if (words.length) lines.push(lineFromWords(words));
    }
    pages.push({
      width: dim ? Number(dim[1]) : 0,
      height: dim ? Number(dim[2]) : 0,
      // Scans carry stray marks that the OCR emits out of sequence — on the
      // Psychomachia, six pages had their LINE elements in an order that was
      // not the reading order. Sorting by position is what makes the XML's
      // ordering trustworthy; taking document order on faith is not.
      lines: lines.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0),
    });
  }
  return pages;
}

function lineFromWords(words) {
  const scored = words.filter((w) => w.conf !== null);
  return {
    text: words.map((w) => w.text).join(' '),
    words,
    x0: Math.min(...words.map((w) => w.x0)),
    x1: Math.max(...words.map((w) => w.x1)),
    y0: Math.min(...words.map((w) => w.y0)),
    y1: Math.max(...words.map((w) => w.y1)),
    conf: scored.length
      ? Math.round(scored.reduce((a, w) => a + w.conf, 0) / scored.length)
      : null,
  };
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Letters only — the test for "is this a word or a scanner's twitch". */
const alphaLength = (s) => (s.match(/[A-Za-zſ]/g) || []).length;

/**
 * Work out where the body text block sits on this page, from the lines that
 * are obviously body text: the long ones. A measure-width verse line is the
 * most common thing on the page, so its left margin is the page's left margin
 * — no need to be told the margin in a config, and no need for it to be the
 * same on every page, which on a shifted scan it is not.
 */
export function bodyBlock(lines, { minLetters = 12 } = {}) {
  const long = lines.filter((l) => alphaLength(l.text) >= minLetters);
  if (!long.length) return null;
  return {
    x0: median(long.map((l) => l.x0)),
    x1: median(long.map((l) => l.x1)),
    top: Math.min(...long.map((l) => l.y0)),
    bottom: Math.max(...long.map((l) => l.y1)),
    height: median(long.map((l) => l.y1 - l.y0)),
    count: long.length,
  };
}

/**
 * Give every line on a page a role.
 *
 *   body      — a line of the text
 *   turnover  — the tail of the previous line, set flush right because it
 *               would not fit the measure. Belongs joined to it, not alone.
 *   header    — above the text block: page number, running head
 *   footer    — below it: catchword, signature mark, press figure
 *   fragment  — inside the block, but too few letters to be a line. Either a
 *               mangled turnover or a speck the scanner read as type; which of
 *               the two is not decidable here, so it is reported, never silently
 *               spliced into the verse.
 *   noise     — a box that is not a line of type at all
 *
 * Decided from geometry and letter COUNT, both of which survive bad OCR.
 * Deciding from the text itself — "starts with a bracket", "is all digits" —
 * is what the flat .txt forced, and it mistakes a mangled page number for
 * verse and a short verse line for a catchword.
 *
 * Word count is deliberately not used. The scanner splits a row of specks in
 * the margin into eight "words", so counting them makes the emptiest line on
 * the page look like the fullest — which is exactly how `2 „ — — K 2 8 8`
 * first came through as verse.
 */
export function classifyLines(page, options = {}) {
  const {
    minLetters = 12,
    // Below this, no arrangement of the letters is a line of verse.
    fragmentLetters = 8,
    // A turnover is set flush right; anything starting within this fraction of
    // the measure from the left margin is a line in its own right.
    turnoverIndent = 0.35,
    shortLine = 0.55,
    // A box several times the height of a line of type is not one line.
    tallLine = 2.5,
  } = options;

  const block = bodyBlock(page.lines, { minLetters });
  if (!block) return page.lines.map((line) => ({ ...line, role: 'noise', why: 'no body block on page' }));

  const measure = Math.max(1, block.x1 - block.x0);

  return page.lines.map((line) => {
    const at = (role, why) => ({ ...line, role, why });
    const letters = alphaLength(line.text);
    const short = line.x1 - line.x0 < measure * shortLine;
    const indent = (line.x0 - block.x0) / measure;

    // Height first: a box spanning several lines of type is a column of specks
    // in the margin, and it can overlap the text block vertically.
    if (block.height && line.y1 - line.y0 > block.height * tallLine) {
      return at('noise', `${Math.round((line.y1 - line.y0) / block.height)}× the height of a line of type`);
    }
    // Then position, before letter count — a page number reads as 'header'
    // rather than 'noise', which is what the review file wants to say.
    if (line.y1 < block.top) return at('header', 'above the text block');
    if (line.y0 > block.bottom) return at('footer', 'below the text block');
    if (letters === 0) return at('noise', 'no letters');

    if (letters < fragmentLetters) {
      return indent > turnoverIndent
        ? at('turnover', `${letters} letters, set ${Math.round(indent * 100)}% into the measure`)
        : at('fragment', `only ${letters} letters — too few to be a line`);
    }

    // Long enough to be a line of text on any reading.
    if (!short) return at('body', 'full measure');

    // Short, and set well to the right: the tail of the line above.
    if (indent > turnoverIndent) return at('turnover', `short and set ${Math.round(indent * 100)}% into the measure`);

    // Short, at the left margin: a real short line — a heading, the last line
    // of a section, a line the poet ended early. Keep it.
    return at('body', 'short but at the left margin');
  });
}

/**
 * Fold turnovers back into the line they belong to, and drop everything that
 * is not text. `isHeading` tells the gap detector which lines are display type,
 * whose leading is not the body's. Returns the kept lines plus a full account of what was dropped,
 * so a removal is always reviewable — a silent drop is how a real line of the
 * poem goes missing and nobody finds out.
 */
export function assemblePage(classified, { gapRatio = 1.7, isHeading = () => false } = {}) {
  const kept = [];
  const dropped = [];

  for (const line of classified) {
    if (line.role === 'body') {
      kept.push({ ...line, joined: [] });
      continue;
    }
    const host = kept[kept.length - 1];
    // A fragment joins only where the line above plainly wants continuing —
    // it breaks off with no stop. Where the line above is complete, the
    // fragment is a speck, and guessing it into the verse would put letters on
    // the page that no printed copy has.
    const wantsMore = host && !/[.,;:!?)"'’”—-]\s*$/.test(host.text);
    if ((line.role === 'turnover' || (line.role === 'fragment' && wantsMore)) && host) {
      host.text = `${host.text.replace(/\s+$/, '')} ${line.text.trim()}`;
      host.joined.push(line.text.trim());
      continue;
    }
    dropped.push(line);
  }

  // Lines the scanner never saw. On a page of regularly leaded verse the
  // baseline-to-baseline distance is near constant, so a gap half again the
  // usual one means type that did not come through — the one kind of damage
  // that leaves no trace in the text and so would otherwise ship unnoticed.
  const gaps = [];
  for (let i = 1; i < kept.length; i++) gaps.push(kept[i].y0 - kept[i - 1].y0);
  const typical = median(gaps.filter((g) => g > 0));
  const suspectedGaps = [];
  if (typical > 0) {
    for (let i = 1; i < kept.length; i++) {
      const gap = kept[i].y0 - kept[i - 1].y0;
      // Display type is set with its own leading, so the pitch test fires at
      // every heading and reports a line that was never there. A checklist
      // with a false entry at each of eight headings is a checklist nobody
      // finishes, so headings are excluded rather than explained away.
      if (isHeading(kept[i].text) || isHeading(kept[i - 1].text)) continue;
      if (gap > typical * gapRatio) {
        suspectedGaps.push({
          after: kept[i - 1].text,
          before: kept[i].text,
          missing: Math.max(1, Math.round(gap / typical) - 1),
        });
      }
    }
  }

  return { kept, dropped, suspectedGaps };
}

/**
 * Lines whose OCR the scanner itself was unsure of. Surfaced rather than
 * corrected: guessing at an eighteenth-century word from context is how an
 * edition acquires readings no printed copy ever had.
 */
export function lowConfidence(lines, { lineThreshold = 70, wordThreshold = 45 } = {}) {
  const out = [];
  for (const line of lines) {
    const bad = line.words.filter((w) => w.conf !== null && w.conf < wordThreshold);
    if ((line.conf !== null && line.conf < lineThreshold) || bad.length) {
      out.push({ text: line.text, conf: line.conf, words: bad.map((w) => `${w.text}(${w.conf})`) });
    }
  }
  return out;
}

// Characters that appear in this class of scan only as specks, rules, press
// figures and misread ornaments — never as punctuation the printer set.
const STRAY = /^[|©£§®°^~_*+=`'"\\/—–.,:;!]+$/;

/**
 * Drop the standalone marks a scan of old type leaves scattered through a
 * line: a rule read as `|`, an ornament read as `©`, a press figure, the
 * printed line number in the margin.
 *
 * Only ever whole space-delimited tokens, never characters inside a word, so
 * punctuation the printer actually set survives. `A`, `I` and `O` are spared
 * because they are words; every other lone letter in this typeface is a speck
 * or the tail of a word the scanner split.
 *
 * Marginal numbers are removed only at the ends of a line, where the printer
 * put them. A number inside the line is left alone — it may be the poem's.
 *
 * Returns what it removed as well as what it kept. A lone letter is USUALLY a
 * speck, but sometimes it is all the scanner managed of a real word, and the
 * difference is not visible from here — so the removals go in the review file
 * rather than vanishing.
 */
export function stripStrayMarks(line) {
  const removed = [];
  const keep = (t) => {
    if (STRAY.test(t)) return false;
    // `A`, `I` and `O` are words; every other lone letter in this typeface is
    // a speck, or the tail of a word the scanner split.
    if (/^[A-Za-z]$/.test(t) && !/^[AIOaio]$/.test(t)) return false;
    return true;
  };

  let tokens = line.split(/\s+/).filter(Boolean);
  tokens = tokens.filter((t) => (keep(t) ? true : (removed.push(t), false)));
  while (tokens.length && /^\d{1,4}$/.test(tokens[0])) removed.push(tokens.shift());
  while (tokens.length && /^\d{1,4}$/.test(tokens[tokens.length - 1])) removed.push(tokens.pop());

  return {
    text: tokens.join(' ').replace(/\s+([,.;:!?])/g, '$1').trim(),
    removed,
  };
}

/**
 * Word-level corrections that keep the case they found.
 *
 * Eighteenth-century printing capitalises nouns, and the same misread word
 * turns up as `Cafe` in the preface and `cafe` in the poem. A case-insensitive
 * regex replacement fixes the letter and quietly destroys the capitalisation,
 * which is part of the text — so the case of what was there is carried over to
 * what replaces it.
 *
 * `fixes` maps the misreading to the reading; matching is on whole words and
 * ignores case. Only the FIRST letter of the replacement takes the case of
 * what it replaced — the rest is written as authored, so a multi-word reading
 * keeps its own capitals (`'ot faith'` -> `'of Faith'`).
 */
export function applyWordFixes(text, fixes = {}) {
  const applied = new Map();
  for (const [wrong, right] of Object.entries(fixes)) {
    // Anchor with \b only where the edge is a word character. A key that ends
    // in punctuation ("IRS T,") has no word boundary after it, and a trailing
    // \b there matches nothing at all — silently, which is the worst way for a
    // correction to fail.
    const escaped = wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lead = /^[A-Za-z0-9]/.test(wrong) ? '\\b' : '';
    const tail = /[A-Za-z0-9]$/.test(wrong) ? '\\b' : '';
    const re = new RegExp(`${lead}${escaped}${tail}`, 'gi');
    text = text.replace(re, (found) => {
      applied.set(wrong, (applied.get(wrong) ?? 0) + 1);
      if (found === found.toUpperCase() && /[A-Z]{2}/.test(found)) return right.toUpperCase();
      if (found[0] === found[0].toUpperCase()) return right[0].toUpperCase() + right.slice(1);
      return right;
    });
  }
  return { text, applied };
}

/**
 * CommonMark hard breaks for verse. The reader loads remark-gfm only — no
 * remark-breaks — so plain lines fold into one paragraph. A trailing backslash
 * survives trimEnd() where two trailing spaces would not, and it is already
 * the convention in this corpus (the Alfred Boethius lays).
 *
 * A line before a blank, or before a heading, is stanza-final: the paragraph
 * already ends there and a backslash would render a stray break.
 */
export function markVerseBreaks(lines) {
  return lines.map((line, i) => {
    const here = line.trim();
    if (!here || here.startsWith('#')) return line;
    const next = (lines[i + 1] ?? '').trim();
    if (!next || next.startsWith('#')) return line;
    return here.endsWith('\\') ? line : `${line}\\`;
  });
}
