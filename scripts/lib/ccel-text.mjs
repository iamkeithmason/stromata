/**
 * ccel-text.mjs — turn a CCEL plain-text export into markdown.
 *
 * CCEL serves every work as one plain-text file at
 *   https://ccel.org/ccel/{letter}/{author}/{work}/cache/{work}.txt
 * (see "Notes on Sources" in CLAUDE.md). fetch-texts.mjs treats every source as
 * HTML, so these files had no committed path; the 2026-11-20 cloud run found
 * four of its five top-scored prospects were CCEL exports and converted them by
 * hand. This is that converter, kept.
 *
 * The format: sections separated by a rule of underscores; headings flush left
 * (chapter heads) or centred (part heads); body paragraphs indented three
 * spaces and hard-wrapped; block quotes and verse indented further; the
 * translator's footnotes gathered in their own rule-bounded section as "[n] …"
 * with "[n]" markers in the text. A reading edition drops the footnotes and
 * the markers, as split-into-chapters.mjs does by default.
 *
 * Pure: no I/O. The CLI is scripts/ingestion/ccel-to-markdown.mjs.
 */

const RULE = /^\s*_{20,}\s*$/;
const FOOTNOTE_LINE = /^\s{0,4}\[\d+\]\s/;
const CHAPTER = /^CHAPTER\s+([IVXLCDM]+|\d+)\.?$/;

const isCaps = (s) => s === s.toUpperCase() && /[A-Z]/.test(s);

function splitBlank(lines) {
  const out = [];
  let cur = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(l);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Inline clean-up: footnote markers, double-hyphen dashes, doubled spaces. */
export function cleanInline(s) {
  return s
    .replace(/\s*\[\d+\]/g, '')
    .replace(/\s*\^/g, '')
    .replace(/(\S)- -(\S)/g, '$1—$2')
    .replace(/ ?-- ?/g, '—')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Raw CCEL text → blocks: {type: 'heading', text, indent} | {type: 'para', text, indent}
 * | {type: 'quote', lines, indent}. Footnote sections and stray footnote paragraphs are dropped.
 */
export function parseCcel(raw) {
  const sections = [[]];
  for (const l of raw.replace(/\r/g, '').split('\n')) {
    if (RULE.test(l)) sections.push([]);
    else sections[sections.length - 1].push(l);
  }

  const blocks = [];
  for (const sec of sections) {
    const paras = splitBlank(sec);
    if (!paras.length) continue;
    if (paras.every((p) => FOOTNOTE_LINE.test(p[0]))) continue; // the apparatus
    for (const p of paras) {
      if (FOOTNOTE_LINE.test(p[0])) continue;
      const indent = Math.min(...p.map((l) => l.match(/^ */)[0].length));
      const text = cleanInline(p.map((l) => l.trim()).join(' '));
      const short = p.length <= 3 && text.length < 120;
      if (short && (indent === 0 || indent >= 10)) blocks.push({ type: 'heading', text, indent });
      else if (indent >= 5) blocks.push({ type: 'quote', lines: p.map((l) => cleanInline(l)), indent });
      else blocks.push({ type: 'para', text, indent });
    }
  }
  return blocks;
}

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'from', 'into', 'that']);

/** ALL-CAPS heading → title case; mixed-case text is left alone. Roman numerals stay upper. */
export function titleCase(s) {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w)) return w;
      if (i > 0 && /^[ivxlcdm]+[.,:;]?$/.test(w)) return w.toUpperCase();
      if (i > 0 && SMALL.has(w.replace(/[^a-z]/g, ''))) return w;
      return w.replace(/[a-z]/, (c) => c.toUpperCase());
    })
    .join('');
}

/**
 * Blocks → markdown. Centred headings become ##, flush-left headings ### (or ##
 * when `flatHeadings`), "CHAPTER N" always ##, and a short line straight after a
 * chapter head (the editor's chapter summary) is set in italics.
 */
export function toMarkdown(blocks, { flatHeadings = false } = {}) {
  const out = [];
  let afterChapter = false;
  let prevHeading = null;
  for (const b of blocks) {
    if (b.type === 'quote') {
      if (isCaps(b.lines.join(' ')) && b.lines.length <= 4) out.push('### ' + titleCase(b.lines.join(' ')));
      else out.push(b.lines.map((l) => '> ' + l).join('  \n'));
      afterChapter = false;
      prevHeading = null;
      continue;
    }
    const t = b.text;
    const chap = t.match(CHAPTER);
    if (chap) {
      out.push(`## Chapter ${chap[1]}`);
      afterChapter = true;
      prevHeading = null;
      continue;
    }
    const isHeading = b.type === 'heading' || (b.indent <= 2 && t.length < 120 && isCaps(t) && !/[;:]$/.test(t));
    if (isHeading) {
      const level = b.type === 'heading' && b.indent >= 10 ? '##' : flatHeadings ? '##' : '###';
      const text = t.replace(/\.$/, '');
      // A heading broken across two lines ("… WENT FROM BETHANY TO" / "JERUSALEM …").
      if (prevHeading && prevHeading.level === level && /\b(TO|THE|OF|AND|IN|ON)$/.test(prevHeading.text)) {
        prevHeading.text += ' ' + text;
        out[out.length - 1] = `${level} ${titleCase(prevHeading.text)}`;
        continue;
      }
      if (prevHeading && prevHeading.text === text) continue;
      out.push(`${level} ${titleCase(text)}`);
      prevHeading = { level, text };
      afterChapter = /^PREFACE$/i.test(text);
      continue;
    }
    prevHeading = null;
    if (afterChapter && t.length < 220) {
      out.push('*' + t.replace(/^"(.*)"$/, '$1').replace(/\*/g, '') + '*');
      afterChapter = false;
      continue;
    }
    afterChapter = false;
    out.push(t);
  }
  return out.join('\n\n') + '\n';
}

/** Index of the first block whose text is exactly `text` (trimmed), from `from`. */
export function findBlock(blocks, text, from = 0) {
  for (let i = from; i < blocks.length; i++) {
    if ((blocks[i].text || '').trim() === text) return i;
  }
  return -1;
}
