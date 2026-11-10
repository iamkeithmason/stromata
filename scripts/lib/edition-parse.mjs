/**
 * edition-parse.mjs — the judgement half of `propose-edition-metadata.mjs`.
 *
 * Reads the three free-text provenance columns on a `texts` row
 * (`source_attribution`, `translation_notes`, `provenance_notes`) and PROPOSES
 * structured edition fields: translator(s), series, volume, year, publisher,
 * place, and whether the text is a translation at all. Pure and deterministic:
 * no I/O, no clock, no model. Same row in, same proposal out.
 *
 * Detection only. Nothing here decides; every field carries the `method` that
 * produced it and every doubt carries a discriminated `reason` code, so the
 * editor (and the Step 2 apply script) can tell a confident pattern match from
 * an inference. AI proposes, editor approves.
 *
 * Field priority: `source_attribution` is the citation as written for readers,
 * so it wins; `translation_notes` is the copyright reasoning (it names
 * translators and series too, but also names editions in order to RULE THEM
 * OUT, e.g. Psychomachia: "appears in neither the Ante-Nicene nor the Nicene
 * and Post-Nicene Fathers"); `provenance_notes` is last.
 */

// ── Vocabulary ────────────────────────────────────────────────────────────────

export const SERIES = {
  ANF: { label: 'Ante-Nicene Fathers', multiVolume: true, alwaysTranslation: true, knownPdSeries: true },
  NPNF1: { label: 'Nicene and Post-Nicene Fathers, Series 1', multiVolume: true, alwaysTranslation: true, knownPdSeries: true },
  NPNF2: { label: 'Nicene and Post-Nicene Fathers, Series 2', multiVolume: true, alwaysTranslation: true, knownPdSeries: true },
  LIB_FATHERS: { label: 'Library of the Fathers (Oxford)', multiVolume: true, alwaysTranslation: true, knownPdSeries: true },
  LUTHER_PHILA: { label: 'Works of Martin Luther (Philadelphia Edition)', multiVolume: true, alwaysTranslation: true, knownPdSeries: true },
  PARKER: { label: 'Parker Society', multiVolume: false, alwaysTranslation: false, knownPdSeries: true },
  SCHAFF_CREEDS: { label: 'The Creeds of Christendom (Schaff)', multiVolume: true, alwaysTranslation: false, knownPdSeries: true },
  TCL_SPCK: { label: 'Translations of Christian Literature (SPCK)', multiVolume: false, alwaysTranslation: true, knownPdSeries: false },
  OTHER: { label: 'Other named edition', multiVolume: false, alwaysTranslation: false, knownPdSeries: false },
};

/** People who EDITED a series and are sometimes mis-recorded as its translator. */
export const SERIES_EDITORS = {
  ANF: ['A. Cleveland Coxe', 'Philip Schaff', 'Allan Menzies'],
  NPNF1: ['Philip Schaff'],
  NPNF2: ['Philip Schaff', 'Henry Wace'],
};
// Menzies edited ANF vol. X but also translated in it (Origin's Commentary on
// John etc.), so a Menzies credit on ANF X is NOT flagged; see isEditorCredit.

/** NPNF Series 1 holds only Augustine and Chrysostom; everyone else is Series 2. */
const NPNF1_AUTHORS = /\b(augustine|chrysostom)\b/i;

/**
 * Translator alias map: variant → canonical display name, or an array when the
 * variant names a partnership. Keys are compared after `nameKey()` folding.
 */
export const TRANSLATOR_ALIASES = {
  'R. E. Wallis': 'Robert Ernest Wallis',
  'Robert E. Wallis': 'Robert Ernest Wallis',
  'Roberts & Donaldson': ['Alexander Roberts', 'James Donaldson'],
  'Roberts and Donaldson': ['Alexander Roberts', 'James Donaldson'],
  'Roberts-Donaldson': ['Alexander Roberts', 'James Donaldson'],
  'W. H. Fremantle': 'W.H. Fremantle',
  'Dods & Reith': ['Marcus Dods', 'George Reith'],
  'Dods and Reith': ['Marcus Dods', 'George Reith'],
  'Gifford': 'Edwin Hamilton Gifford',
  'Pilkington': 'J.G. Pilkington',
  'J. G. Pilkington': 'J.G. Pilkington',
  'Fremantle': 'W.H. Fremantle',
  'Wiffen': 'Benjamin Barron Wiffen',
  'Thorpe': 'Benjamin Thorpe',
  'Jacobs': 'C. M. Jacobs',
  'Steinhaeuser': 'A. T. W. Steinhaeuser',
  'Morris': 'John Brande Morris',
  'Schaff': 'Philip Schaff',
};

export const REASONS = [
  'no_provenance_text',
  'original_english',
  'ambiguous_series',
  'volume_missing',
  'translator_missing',
  'translator_is_editor',
  'year_suspect',
  'series_false_positive_suspect',
  'collection_mixed',
  'modern_translation_check',
  'url_only',
];

/** The cut-off the copyright rule uses: a translation published before 1929 is PD in the US. */
export const PD_PUBLICATION_CUTOFF = 1928;

// ── Text helpers ──────────────────────────────────────────────────────────────

/** Strip markdown emphasis and backslash escapes ("Vol. 9\." → "Vol. 9."). */
export function clean(s) {
  if (!s) return '';
  return String(s)
    .replace(/\\([.\-*_()[\]#])/g, '$1')
    .replace(/[*_]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100 };
export function romanToInt(r) {
  const s = r.toUpperCase();
  if (!/^[IVXLC]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]];
    const next = ROMAN[s[i + 1]] || 0;
    total += v < next ? -v : v;
  }
  return total;
}

export function parseVolumeToken(tok) {
  if (/^\d+$/.test(tok)) return parseInt(tok, 10);
  return romanToInt(tok);
}

/** Fold a name for comparison: drop dots/spaces around initials, lower-case. */
export function nameKey(n) {
  return n.toLowerCase().replace(/\./g, '').replace(/\s+/g, '').replace(/[‐-―]/g, '-');
}

const ALIAS_INDEX = Object.fromEntries(Object.entries(TRANSLATOR_ALIASES).map(([k, v]) => [nameKey(k), v]));

/** Resolve one raw name through the alias map. Returns {names, aliased}. */
export function resolveAlias(raw) {
  const hit = ALIAS_INDEX[nameKey(raw)];
  if (!hit) return { names: [raw], aliased: false };
  return { names: Array.isArray(hit) ? hit : [hit], aliased: true };
}

/** Is this whole string just a URL? */
export function isBareUrl(s) {
  return /^\s*<?https?:\/\/\S+>?\s*$/.test(s || '');
}

// ── Series ────────────────────────────────────────────────────────────────────

const NEGATION = /\b(neither|nor|not|never|no\s+(?:separate|\d|nineteenth|19th|public)|absent|rather than|instead of|rules? out)\b/i;

/** The sentence containing index i (split on ". " / "; " that are not after initials). */
function sentenceAround(text, i) {
  let start = 0;
  let end = text.length;
  const re = /(?<![A-Z]|\bVol|\bNo|\bCo|\bed|\bSt|\bRev|\bc)[.;]\s+(?=[A-Z])/g;
  let m;
  while ((m = re.exec(text))) {
    if (m.index < i) start = m.index + m[0].length;
    else { end = m.index; break; }
  }
  return text.slice(start, end);
}

const SERIES_PATTERNS = [
  // NPNF — explicit series number first, so the bare form is the fallback.
  { key: 'NPNF', re: /\bNPNF\s*([12])\b|\bNPNF\b|\bNicene\s+(?:and|&)\s+Post-Nicene\s+Fathers\b/gi },
  { key: 'ANF', re: /\bAnte-Nicene\s+(?:Fathers|Christian\s+Library)\b|\bANF\b/gi },
  { key: 'LIB_FATHERS', re: /\bLibrary\s+of\s+(?:the\s+)?(?:Holy\s+Catholic\s+Church,?\s*)?Fathers\b|\bLibrary\s+of\s+the\s+Fathers\b|\bLF\s+vol/gi },
  { key: 'LUTHER_PHILA', re: /\bWorks\s+of\s+Martin\s+Luther\b|\bPhiladelphia\s+Edition\b/gi },
  { key: 'PARKER', re: /\bParker\s+Society\b/gi },
  { key: 'SCHAFF_CREEDS', re: /\bCreeds\s+of\s+Christendom\b/gi },
  { key: 'TCL_SPCK', re: /\bTranslations\s+of\s+Christian\s+Literature\b/gi },
];

/** NPNF series number from the text right after (or just before) the mention. */
function npnfSeriesNumber(text, m) {
  if (m[1]) return parseInt(m[1], 10);
  const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
  const before = text.slice(Math.max(0, m.index - 25), m.index);
  const pick = s => {
    let x = s.match(/^\W{0,4}(?:Series|Ser\.)\s*(II|I|2|1)\b/i);
    if (x) return /^(II|2)$/i.test(x[1]) ? 2 : 1;
    x = s.match(/^\W{0,4}(First|Second|1st|2nd)\s+Series\b/i);
    if (x) return /^(Second|2nd)$/i.test(x[1]) ? 2 : 1;
    return null;
  };
  // "Library of Nicene and Post-Nicene Fathers, Second Series" / "NPNF Series II"
  const a = pick(after);
  if (a) return a;
  const b = before.match(/(First|Second)\s+Series\W{0,4}$/i);
  if (b) return /Second/i.test(b[1]) ? 2 : 1;
  return null;
}

/**
 * Find series mentions in one field. Returns [{key, raw, index, negated, explicitNumber}].
 * NPNF with no number comes back as key 'NPNF' for the caller to infer.
 */
export function findSeriesMentions(text) {
  const out = [];
  for (const { key, re } of SERIES_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      // "Works of Martin Luther" only counts as the Philadelphia Edition with a
      // Philadelphia/Holman signal nearby; the Fortress American Edition is "Luther's Works".
      if (key === 'LUTHER_PHILA' && /Works of Martin Luther/i.test(m[0])
        && !/Philadelphia|Holman|Muhlenberg/i.test(text)) continue;
      let k = key;
      let explicitNumber = false;
      if (key === 'NPNF') {
        const n = npnfSeriesNumber(text, m);
        if (n) { k = `NPNF${n}`; explicitNumber = true; }
      }
      const sentence = sentenceAround(text, m.index);
      out.push({ key: k, raw: m[0], index: m.index, end: m.index + m[0].length, negated: NEGATION.test(sentence), explicitNumber });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

// ── Volume ────────────────────────────────────────────────────────────────────

/**
 * Volume near a series mention: look in the 90 chars after it ("NPNF, Series I,
 * Vol. 12", "NPNF2 vol. 13", "Vol. X — Additional Volume"), then a short way
 * before ("Ante-Nicene Fathers, Vol. 4" is after; "LF vol. 41" covered by the
 * mention itself). Returns {volume, raw, additional}.
 */
export function findVolume(text, mention) {
  const from = mention ? mention.index : 0;
  const window = text.slice(from, (mention ? mention.end : 0) + 90);
  const m = window.match(/\b(?:Vol(?:ume)?s?|vol)\.?\s*([IVXLC]+|\d{1,3})(?![\w])/);
  if (m) {
    const v = parseVolumeToken(m[1]);
    if (v) return { volume: v, raw: m[0], additional: /Additional\s+Volume/i.test(window) };
  }
  if (mention && /Additional\s+Volume/i.test(text.slice(from, from + 60))) {
    return { volume: null, raw: 'Additional Volume', additional: true };
  }
  return null;
}

// ── Years ─────────────────────────────────────────────────────────────────────

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';

/**
 * Candidate publication years in a field, in order, skipping lifespans
 * ("(1821–1870)"), death/birth years ("d. 1887", "died 1878"), access dates,
 * "pre-1900"-style thresholds, and "life + 70 … 2003" style reasoning.
 * Five-digit "years" that look like a typo of one (18888) come back flagged.
 */
export function findYears(text) {
  const out = [];
  const re = /\b(1\d{4}|1[4-9]\d\d|20[0-3]\d)\b/g;
  let m;
  while ((m = re.exec(text))) {
    const s = m[1];
    const before = text.slice(Math.max(0, m.index - 22), m.index);
    const after = text.slice(m.index + s.length, m.index + s.length + 6);
    if (/[–\-—]\s*$/.test(before) && /\d{4}\s*[–\-—]\s*$/.test(before)) continue; // end of a range
    if (/^\s*[–\-—]\s*\d{2,4}/.test(after)) continue; // start of a range (lifespan)
    if (/^\s*\/\s*1\d{3}/.test(after)) continue; // "1871/1887": the later is the cited reprint
    if (/\bin copyright\b|\bcopyrighted\b|\bmodern (?:edition|translation)/i.test(sentenceAround(text, m.index))) continue;
    if (/\b(?:d|b|died|born|fl|death)\.?\s*(?:c\.\s*|in\s+)?$/i.test(before)) continue;
    if (/\bpre-?\s*$|\bbefore\s+$|\bafter\s+$|\buntil\s+$|\bexpired\s+$/i.test(before)) continue;
    if (new RegExp(`(?:Accessed|accessed)\\s+(?:${MONTHS})?\\s*$`).test(before)) continue;
    if (new RegExp(`(?:${MONTHS})\\s*$`).test(before) && /accessed/i.test(text.slice(Math.max(0, m.index - 40), m.index))) continue;
    if (/\bc\.\s*$/.test(before) && /\bAD\b|\bcomposed\b/i.test(text.slice(m.index - 40, m.index + 20))) continue;
    if (s.length === 5) {
      out.push({ year: null, raw: s, suspect: true, index: m.index });
      continue;
    }
    out.push({ year: parseInt(s, 10), raw: s, suspect: false, index: m.index });
  }
  return out;
}

// ── Publisher / place ─────────────────────────────────────────────────────────

/** "(New York: Scribner, 1891)", "Buffalo, NY: Christian Literature Publishing Co., 1887", "London: SPCK, 1920". */
export function findImprint(text) {
  const m = text.match(/\b((?:New\s+York|St\.\s+Louis|[A-Z][a-z]+)(?:,\s*[A-Z]{2,3}\.?)?)\s*:\s*([^:;()]+?),\s*(1\d{3})\b/);
  if (m) return { place: m[1].trim(), publisher: m[2].trim().replace(/^Printed by\s+/i, '').replace(/\s+/g, ' '), year: parseInt(m[3], 10) };
  const p = text.match(/\b((?:[A-Z][\w&'’-]*\s+){0,4}(?:Publishing\s+Co\.|Publishing\s+House|Company|Co\.|Press|Brothers|& Sons|and Sons))(?:,|\s+\()/);
  if (p) {
    const publisher = p[1].replace(/^(?:From|In|By|Edited|ed)\s+/i, '').trim();
    const placeM = text.match(/\(([A-Z][a-z]+)(?:,\s*1\d{3})\)/);
    return { place: placeM ? placeM[1] : null, publisher, year: null };
  }
  const placeOnly = text.match(/\((London|Oxford|Cambridge|Edinburgh|Philadelphia|New York|Boston|Buffalo|Dublin)(?:,\s*1\d{3}[^)]*)\)/);
  if (placeOnly) return { place: placeOnly[1], publisher: null, year: null };
  return null;
}

// ── Translators ───────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'from', 'in', 'for', 'of', 'the', 'npnf', 'anf', 'ante-nicene', 'nicene', 'vol', 'vol.', 'volume',
  'series', 'library', 'works', 'edited', 'ed', 'ed.', 'revised', 'public', 'published', 'first',
  'second', 'translation', 'translated', 'via', 'new', 'christian', 'london', 'oxford', 'cambridge',
  'edinburgh', 'philadelphia', 'buffalo', 'text', 'source', 'sourced', 'author', 'this', 'with',
  'project', 'is', 'was', 'and', 'et', 'al', 'al.', 'standard', 'original',
]);
const TITLES = /^(?:Rev\.?|Revd\.?|Dr\.?|Sir|Mr\.?|Mrs\.?|Prof\.?|Professor|Dom|Fr\.?|the\s+Rev\.?)$/i;
/** Post-nominals that look like initials but are not people: ", O.S.B.", ", D.D." */
const POST_NOMINALS = /,?\s*\b(?:O\.S\.B|S\.J|O\.P|D\.D|M\.A|B\.A|LL\.D|Ph\.D)\.(?=\s|,|\)|$)/g;
const PARTICLES = new Set(['de', 'van', 'von', 'du', 'da', 'le', 'la', 'der', 'den']);

/** Tokenise into words, initials and punctuation, keeping offsets. */
function tokens(s) {
  const out = [];
  const re = /(?:[A-Z]\.){2,}|[A-Z]\.|[\p{L}][\p{L}'’\-]*\.?|\d+|&|\/|,|\(|\)|;|:|—|–|\./gu;
  let m;
  while ((m = re.exec(s))) out.push({ t: m[0], i: m.index });
  return out;
}

const isInitials = t => /^(?:[A-Z]\.)+$/.test(t);
const isCapWord = t => /^[\p{Lu}][\p{L}'’\-]*$/u.test(t);

/**
 * Read a list of person names starting at the beginning of `s`, token-aware.
 * Handles initials ("S. Thelwall", "C.A. Heurtley", "W.R.W. Stephens"),
 * "and"/"&"/comma joins, "(with G. Lewis & W. G. Martley)", "et al.", and stops
 * at the first thing that is not a name: "(ANF, Vol. I)", ". From …",
 * ", in Works …", "for Project Wittenberg".
 * Returns { names: [...], etAl: bool, consumed: number }.
 */
export function readNames(s) {
  s = s.replace(POST_NOMINALS, '');
  const toks = tokens(s);
  const names = [];
  let cur = [];
  let etAl = false;
  let i = 0;
  const flush = () => {
    const words = cur.filter(w => !TITLES.test(w));
    if (words.length) names.push(words.join(' ').replace(/\s+([,.])/g, '$1'));
    cur = [];
  };
  const startsName = j => {
    const t = toks[j]?.t;
    if (!t) return false;
    const bare = t.replace(/\.$/, '');
    if (STOP_WORDS.has(t.toLowerCase()) || STOP_WORDS.has(bare.toLowerCase())) return false;
    if (/^[A-Z]{2,}$/.test(bare)) return false; // acronyms: NPNF, ANF, SPCK
    return isInitials(t) || isCapWord(bare) || TITLES.test(t);
  };
  let end = 0;
  for (; i < toks.length; i++) {
    const { t } = toks[i];
    const bare = t.replace(/\.$/, '');
    if (cur.length === 0 && !startsName(i)) break;
    if (/^et$/i.test(t) && /^al\.?$/i.test(toks[i + 1]?.t || '')) { etAl = true; i++; end = toks[i].i + toks[i].t.length; break; }
    if (TITLES.test(t)) { end = toks[i].i + t.length; continue; }
    if (isInitials(t)) { cur.push(t); end = toks[i].i + t.length; continue; }
    if (PARTICLES.has(t.toLowerCase()) && cur.length && isCapWord(toks[i + 1]?.t?.replace(/\.$/, '') || '')) { cur.push(t); continue; }
    if (isCapWord(bare) && !STOP_WORDS.has(bare.toLowerCase()) && !/^[A-Z]{2,}$/.test(bare)) {
      cur.push(bare);
      end = toks[i].i + bare.length;
      if (t.endsWith('.')) { // a full word followed by "." is a sentence end, not an initial
        flush();
        i++;
        break;
      }
      continue;
    }
    if (t === '&' || t === '/' || /^and$/i.test(t)) {
      if (cur.length && startsName(i + 1)) { flush(); continue; }
      break;
    }
    if (t === ',') {
      // ", and X" / ", X and Y" continue a list; ", in Works" / ", NPNF" / ", 1887" stop.
      if (/^and$/i.test(toks[i + 1]?.t || '') || toks[i + 1]?.t === '&') { flush(); i++; continue; }
      if (cur.length && startsName(i + 1) && looksLikePerson(toks, i + 1)) { flush(); continue; }
      break;
    }
    if (t === '(') {
      // "(with G. Lewis & W. G. Martley)" — co-translators named in a parenthetical.
      if (/^with$/i.test(toks[i + 1]?.t || '')) {
        flush();
        const close = s.indexOf(')', toks[i].i);
        const inner = s.slice(toks[i + 1].i + 4, close < 0 ? undefined : close);
        names.push(...readNames(inner.trim()).names);
        end = close < 0 ? s.length : close + 1;
        i = toks.findIndex(x => x.i >= end);
        if (i < 0) i = toks.length;
      }
      break;
    }
    break;
  }
  flush();
  return { names: names.filter(n => n.split(' ').length <= 6), etAl, consumed: end };
}

/** A person-shaped name ahead: initial(s) or two capitalised words before a joiner/end. */
function looksLikePerson(toks, j) {
  const seq = [];
  for (let k = j; k < toks.length && k < j + 5; k++) {
    const t = toks[k].t;
    if (t === ',' || t === '&' || /^and$/i.test(t) || t === '(' || t === '.' || t === ';') break;
    seq.push(t);
    if (/[a-z]\.$/.test(t)) break;
  }
  if (!seq.length) return false;
  if (isInitials(seq[0])) return true;
  return seq.length >= 2 && seq.every(t => isCapWord(t.replace(/\.$/, '')) && !STOP_WORDS.has(t.replace(/\.$/, '').toLowerCase()));
}

const FORWARD_CUES = [
  /\bTranslated\s+(?:from\s+(?:the\s+)?[A-Z][a-z]+\s+)?(?:and\s+(?:edited|annotated)\s+)?by\s+/g,
  /\b[Tt]ranslation(?:\s+and\s+[a-z]+(?:\s+[a-z]+)?)?\s+by\s+/g,
  /\btr(?:ans)?\.\s+(?:by\s+)?/g,
  /\btranslator\s+/g,
  /\bTranslator:\s*/g,
];

/**
 * Translator credits in one field. Forward cues ("Translated by X") win; the
 * backward cue ("Gifford translation", "Roberts-Donaldson translation") is the
 * fallback. Returns { names, raw, etAl, method } or null.
 */
export function findTranslators(text) {
  for (const re of FORWARD_CUES) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (!m) continue;
    const rest = text.slice(m.index + m[0].length);
    const r = readNames(rest);
    if (r.names.length) {
      return { names: r.names, raw: (m[0] + rest.slice(0, r.consumed)).trim(), etAl: r.etAl, method: 'pattern' };
    }
  }
  // "Adolph Spaeth, L.D. Reed, Henry Eyster Jacobs, et al., Trans. & Eds."
  const te = text.match(/(?:^|[:;(]\s*)([^:;()]+?),?\s+Trans\.?\s*(?:&|and)\s*Eds?\.?/);
  if (te) {
    const r = readNames(te[1].trim());
    if (r.names.length) return { names: r.names, raw: te[0].trim(), etAl: r.etAl, method: 'pattern' };
  }
  // Backward: "<Names> translation" at the start of a clause.
  const back = /(^|[.;:]\s+|\(\s*)((?:[A-Z][\p{L}.'’\-]*\s*(?:\([^)]*\)\s*)?(?:,\s*|\s+|and\s+|&\s+|\/\s*)?){1,8}?)(?:,\s*\d{4}\s*)?(?:'s\s+)?(?:\d{4}\s+)?translation\b/gu;
  let b;
  while ((b = back.exec(text))) {
    const clause = b[2].replace(/\([^)]*\)/g, ' ').replace(/,\s*\d{4}\s*$/, '').replace(/\s+/g, ' ').trim();
    if (!clause) continue;
    const r = readNames(clause.replace(/'s$/, ''));
    const names = r.names.filter(n => !/^(?:The|This|Standard|English|Old|Modern|Latin|Greek|Abridged|Revised|Complete|Partial|Anonymous|Original|Wiffen's)$/i.test(n) || /^Wiffen/.test(n));
    if (names.length) return { names, raw: b[0].trim(), etAl: r.etAl, method: 'pattern' };
  }
  return null;
}

/** "W. G. Martley" → "W.G. Martley": one spelling for initials, so the same person groups once. */
export function compactInitials(name) {
  return name.replace(/\b([A-Z])\.\s+(?=[A-Z]\.)/g, '$1.');
}

/** Canonicalise a list of raw names through the alias map, keeping order and de-duplicating. */
export function canonicaliseTranslators(rawNames) {
  const out = [];
  let aliased = false;
  // A partnership written as two surnames ("Roberts & Donaldson") is one alias entry.
  if (rawNames.length === 2 && resolveAlias(`${rawNames[0]} & ${rawNames[1]}`).aliased) {
    rawNames = [`${rawNames[0]} & ${rawNames[1]}`];
  }
  for (const raw of rawNames.map(compactInitials)) {
    const { names, aliased: a } = resolveAlias(raw.replace(/'s$/, ''));
    aliased ||= a;
    for (const n of names.map(compactInitials)) if (!out.some(x => nameKey(x) === nameKey(n))) out.push(n);
  }
  return { names: out, aliased };
}

export function displayTranslators(names) {
  if (names.length <= 1) return names[0] ?? null;
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

function isEditorCredit(seriesKey, names, volume) {
  const eds = SERIES_EDITORS[seriesKey] || [];
  return names.some(n => eds.some(e => nameKey(e) === nameKey(n)) && !(nameKey(n) === nameKey('Allan Menzies') && volume === 10));
}

// ── Translation status ────────────────────────────────────────────────────────

const ORIGINAL_ENGLISH = /\b(?:original\s+English(?:\s+composition)?|English\s+original|not\s+a\s+translation|no\s+translation\s+(?:is\s+)?(?:involved|required|needed)|no\s+translator\s+(?:is\s+)?(?:involved|required|needed)|own\s+English|written\s+in\s+English|composed\s+in\s+English)\b/i;
/** The text is printed in its original non-English language (e.g. ANF's Latin Stromata III). */
const UNTRANSLATED = /\buntranslated\b|\bLatin text\b(?![^.]*\btranslat(?:ed|ion) by)/i;

// ── The proposal ──────────────────────────────────────────────────────────────

const FIELDS = ['source_attribution', 'translation_notes', 'provenance_notes'];

/**
 * Propose edition metadata for one row (Pass 1, deterministic).
 *
 * @param {object} row  { slug, title, author: {name, death_year}, source_attribution, translation_notes, provenance_notes, source_url }
 * @returns proposal object (see propose-edition-metadata.mjs for the shape)
 */
export function proposeEdition(row) {
  const text = Object.fromEntries(FIELDS.map(f => [f, clean(row[f])]));
  const all = FIELDS.map(f => text[f]).filter(Boolean).join(' \n ');
  const author = row.author?.name || '';
  const deathYear = row.author?.death_year ?? null;

  const p = {
    is_translation: 'unknown',
    translator_display: null,
    translators: [],
    series_key: null,
    series_raw: null,
    volume: null,
    publication_year: null,
    publisher: null,
    place: null,
    method: {},
    source_field: {},
    confidence: 'low',
    reasons: [],
    notes: [],
  };
  const reason = r => { if (!p.reasons.includes(r)) p.reasons.push(r); };
  const set = (field, value, method, src) => { p[field] = value; p.method[field] = method; if (src) p.source_field[field] = src; };

  if (!all) {
    reason('no_provenance_text');
    p.confidence = 'low';
    return p;
  }
  if (isBareUrl(row.source_attribution)) reason('url_only');

  // Series: the first non-negated mention, taking fields in priority order.
  let mention = null;
  let mentionField = null;
  const negatedSeen = [];
  for (const f of FIELDS) {
    const ms = findSeriesMentions(text[f]);
    for (const m of ms) {
      if (m.negated) { negatedSeen.push(m); continue; }
      // Prefer an NPNF mention that carries its series number over a bare one in the same field.
      if (!mention || (mentionField === f && mention.key === 'NPNF' && /^NPNF[12]$/.test(m.key))) {
        if (!mention || mentionField === f) { mention = m; mentionField = f; }
      }
    }
    if (mention) break;
  }
  if (!mention && negatedSeen.length) {
    reason('series_false_positive_suspect');
    p.notes.push(`series named only to rule it out: "${negatedSeen[0].raw}"`);
  }

  if (mention) {
    let key = mention.key;
    let method = 'pattern';
    if (key === 'NPNF') {
      // Missing series number: Series 1 holds only Augustine and Chrysostom.
      // Before guessing, see whether another field states the number.
      const stated = FIELDS.flatMap(f => findSeriesMentions(text[f])).find(m => !m.negated && /^NPNF[12]$/.test(m.key));
      if (stated) key = stated.key;
      else { key = NPNF1_AUTHORS.test(author) ? 'NPNF1' : 'NPNF2'; method = 'inferred'; }
    }
    set('series_key', key, method, mentionField);
    p.series_raw = mention.raw;
    // Cross-check the series against the author.
    if (key === 'NPNF1' && author && !NPNF1_AUTHORS.test(author)) reason('ambiguous_series');
    if (key === 'NPNF2' && method === 'pattern' && NPNF1_AUTHORS.test(author)) reason('ambiguous_series');
    if (/^(ANF|NPNF[12])$/.test(key) && deathYear && deathYear > 900) reason('series_false_positive_suspect');

    let vol = findVolume(text[mentionField], mention);
    if (!vol) for (const f of FIELDS) { if (f === mentionField) continue; const m2 = findSeriesMentions(text[f]).find(x => !x.negated && x.key.startsWith(key.slice(0, 3))); if (m2) { vol = findVolume(text[f], m2); if (vol?.volume) break; } }
    if (vol?.volume) {
      set('volume', vol.volume, 'pattern', mentionField);
      if (vol.additional) p.notes.push('ANF "Additional Volume"');
    } else if (vol?.additional && key === 'ANF') {
      set('volume', 10, 'inferred', mentionField);
      p.notes.push('ANF "Additional Volume" is vol. 10');
    } else if (SERIES[key]?.multiVolume) {
      reason('volume_missing');
    }
  }

  // Translators: SA first, then TN, then PN.
  let tr = null;
  let trField = null;
  for (const f of FIELDS) {
    if (!text[f]) continue;
    const t = findTranslators(text[f]);
    if (t) { tr = t; trField = f; break; }
  }
  if (tr) {
    // A bare surname ("Padelford translation") expands to a full name written elsewhere in the row.
    tr.names = tr.names.map(n => {
      if (/\s/.test(n) || resolveAlias(n).aliased) return n;
      const full = all.match(new RegExp(`\\b((?:[A-Z][\\p{L}.'’-]*\\s+){1,3}${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'u'));
      return full && !/^(?:The|From|By|Translated|Via)\b/.test(full[1]) ? full[1] : n;
    });
    const { names, aliased } = canonicaliseTranslators(tr.names);
    set('translators', names, aliased ? 'alias' : 'pattern', trField);
    set('translator_display', displayTranslators(names), aliased ? 'alias' : 'pattern', trField);
    p.translator_raw = tr.raw;
    if (p.series_key && isEditorCredit(p.series_key, names, p.volume)) reason('translator_is_editor');
    if (tr.etAl) p.notes.push('credit ends "et al."; the per-work translator is not named');
  }

  // Translation status.
  const saysOriginal = ORIGINAL_ENGLISH.test(all);
  const untranslated = !tr && UNTRANSLATED.test(text.source_attribution);
  if (untranslated) {
    set('is_translation', false, 'pattern', 'source_attribution');
    p.notes.push('printed untranslated, in the original language');
  } else if (saysOriginal && !tr) {
    set('is_translation', false, 'pattern');
    reason('original_english');
  } else if (tr || (p.series_key && SERIES[p.series_key].alwaysTranslation) || /\btranslat/i.test(`${text.source_attribution} ${text.translation_notes}`)) {
    set('is_translation', true, tr ? 'pattern' : 'inferred');
    if (saysOriginal) p.notes.push('notes say "original English" but a translator is credited; check');
  } else if (/\btranslat/i.test(text.provenance_notes)) {
    // Provenance notes often describe a whole compilation ("the letters to Bullinger
    // were originally in Latin"), so on their own they cannot settle one part.
    p.notes.push('provenance notes mention translation, but not of this part specifically');
  }

  // Year: the cited edition's year. Prefer the imprint, then the year in the
  // same field as the series/translator credit, then the other fields.
  const imprintField = FIELDS.find(f => findImprint(text[f]));
  const imprint = imprintField ? findImprint(text[imprintField]) : null;
  if (imprint?.publisher) set('publisher', imprint.publisher, 'pattern', imprintField);
  if (imprint?.place) set('place', imprint.place, 'pattern', imprintField);

  const yearFieldOrder = [p.source_field.series_key, trField, ...FIELDS].filter((f, i, a) => f && a.indexOf(f) === i);
  let year = null;
  let suspect = null;
  if (imprint?.year) year = { year: imprint.year, field: imprintField };
  if (!year) {
    for (const f of yearFieldOrder) {
      const ys = findYears(text[f]);
      const bad = ys.find(y => y.suspect);
      if (bad && !suspect) suspect = { raw: bad.raw, field: f };
      // In a translation note the first year after the credit is the translation year;
      // in an attribution the LAST year is usually the imprint.
      const good = ys.filter(y => !y.suspect);
      if (good.length) { year = { year: (f === 'source_attribution' ? good[good.length - 1] : good[0]).year, field: f }; break; }
    }
  }
  if (!suspect) {
    for (const f of FIELDS) { const bad = findYears(text[f]).find(y => y.suspect); if (bad) { suspect = { raw: bad.raw, field: f }; break; } }
  }
  if (year && untranslated) year = null;
  if (year && p.is_translation === true && deathYear && year.year <= deathYear) {
    p.notes.push(`year ${year.year} is not after the author's death (${deathYear}); likely the original's date, not the translation's`);
    year = null;
  }
  if (year) set('publication_year', year.year, 'pattern', year.field);
  if (suspect) {
    reason('year_suspect');
    p.notes.push(`suspect year "${suspect.raw}" in ${suspect.field}`);
  }
  if (p.publication_year && (p.publication_year > 2030 || (deathYear && p.is_translation === true && p.publication_year < deathYear - 5 && p.publication_year < 1500))) reason('year_suspect');

  // Original-English inference: no translation language anywhere, and the cited
  // edition appeared in (or soon after) the author's lifetime.
  if (p.is_translation === 'unknown' && !tr && deathYear && p.publication_year
    && p.publication_year <= deathYear + 50 && p.publication_year >= deathYear - 80) {
    set('is_translation', false, 'inferred');
    reason('original_english');
    p.notes.push(`edition ${p.publication_year} within the author's lifetime/soon after (d. ${deathYear}), no translator named`);
  }

  if (!p.series_key && !SERIES_KEY_NONE(p) && (imprint || /\bed\.\s|\bedited by\b/i.test(text.source_attribution))) {
    set('series_key', 'OTHER', 'pattern', imprintField || 'source_attribution');
  }

  // Unresolved / suspicious.
  if (p.is_translation !== false && !tr) reason('translator_missing');
  if (p.is_translation === true) {
    const knownPd = p.series_key && SERIES[p.series_key].knownPdSeries;
    if ((p.publication_year && p.publication_year > PD_PUBLICATION_CUTOFF) || (!p.publication_year && !knownPd)) reason('modern_translation_check');
  }

  p.confidence = scoreConfidence(p);
  return p;
}

function SERIES_KEY_NONE(p) { return p.is_translation === false && !p.publication_year; }

function scoreConfidence(p) {
  const methods = Object.values(p.method);
  const serious = ['translator_is_editor', 'year_suspect', 'series_false_positive_suspect', 'ambiguous_series', 'no_provenance_text', 'url_only'];
  if (p.reasons.some(r => serious.includes(r))) return 'low';
  if (p.is_translation === false) return p.method.is_translation === 'pattern' ? 'high' : 'medium';
  if (p.is_translation === 'unknown') return 'low';
  if (!p.translators.length) return 'low';
  if (methods.includes('inferred') || methods.includes('inherited_from_collection')) return 'medium';
  if (p.series_key && SERIES[p.series_key].multiVolume && !p.volume) return 'medium';
  return 'high';
}

// ── Resolution ────────────────────────────────────────────────────────────────

/** Is a proposal "resolved"? Original English, or a translation with what its edition type needs. */
export function isResolved(p) {
  if (p.is_translation === false) return true;
  if (p.is_translation !== true || !p.translators.length) return false;
  const s = p.series_key && SERIES[p.series_key];
  if (s && s.multiVolume && p.series_key !== 'OTHER') return Boolean(p.volume);
  return true;
}

// ── Collections ───────────────────────────────────────────────────────────────

const INHERITABLE = ['series_key', 'volume', 'translator_display', 'publication_year', 'publisher', 'place'];

/**
 * Compare proposals across the parts of each collection. Mutates proposals:
 * flags `collection_mixed` where parts disagree on series or translator, and
 * fills a blank field from siblings when every sibling that has it agrees
 * (`method: inherited_from_collection`). Returns a per-collection report.
 */
export function reconcileCollections(items) {
  const groups = new Map();
  for (const it of items) {
    if (!it.collection_slug) continue;
    if (!groups.has(it.collection_slug)) groups.set(it.collection_slug, []);
    groups.get(it.collection_slug).push(it);
  }
  const report = [];
  for (const [slug, parts] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (parts.length < 2) continue;
    const entry = { collection_slug: slug, parts: parts.length, mixed: [], inherited: {} };
    for (const field of INHERITABLE) {
      const values = parts.map(x => x.proposal[field]).filter(v => v !== null && v !== undefined);
      const distinct = [...new Set(values.map(v => JSON.stringify(v)))];
      if (distinct.length > 1 && ['series_key', 'translator_display', 'volume'].includes(field)) {
        entry.mixed.push({ field, values: distinct.map(v => JSON.parse(v)) });
      }
      if (distinct.length === 1) {
        const value = JSON.parse(distinct[0]);
        for (const x of parts) {
          const pr = x.proposal;
          if (pr[field] !== null && pr[field] !== undefined) continue;
          if (pr.is_translation === false && field !== 'publication_year' && field !== 'publisher' && field !== 'place') continue;
          pr[field] = value;
          pr.method[field] = 'inherited_from_collection';
          if (field === 'translator_display') {
            const donor = parts.find(y => y.proposal.translator_display === value && y.proposal.translators.length);
            pr.translators = donor ? [...donor.proposal.translators] : [];
            pr.method.translators = 'inherited_from_collection';
            pr.reasons = pr.reasons.filter(r => r !== 'translator_missing');
            if (pr.is_translation === 'unknown') { pr.is_translation = true; pr.method.is_translation = 'inherited_from_collection'; }
          }
          if (field === 'volume') pr.reasons = pr.reasons.filter(r => r !== 'volume_missing');
          if (field === 'series_key') {
            const donor = parts.find(y => y.proposal.series_key === value && y.proposal.series_raw);
            pr.series_raw = donor?.proposal.series_raw ?? null;
          }
          if (field === 'publication_year' && pr.is_translation === true) {
            const knownPd = pr.series_key && SERIES[pr.series_key]?.knownPdSeries;
            if (value <= PD_PUBLICATION_CUTOFF || knownPd) pr.reasons = pr.reasons.filter(r => r !== 'modern_translation_check');
          }
          (entry.inherited[field] ||= []).push(x.slug);
        }
      }
    }
    if (entry.mixed.length) {
      // Flag the parts that dissent from a clear majority; with no majority, flag every part.
      for (const m of entry.mixed) {
        const counts = new Map();
        let withValue = 0;
        for (const x of parts) {
          const v = x.proposal[m.field];
          if (v === null || v === undefined) continue;
          withValue++;
          const k = JSON.stringify(v);
          counts.set(k, (counts.get(k) || 0) + 1);
        }
        const [topKey, topN] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
        const majority = topN > withValue / 2 ? topKey : null;
        m.majority = majority ? JSON.parse(majority) : null;
        for (const x of parts) {
          const k = JSON.stringify(x.proposal[m.field] ?? null);
          if (majority && (k === majority || k === 'null')) continue;
          if (!x.proposal.reasons.includes('collection_mixed')) x.proposal.reasons.push('collection_mixed');
          x.proposal.notes.push(`collection parts disagree on ${m.field}${m.majority !== null ? ` (most say ${JSON.stringify(m.majority)})` : ''}`);
        }
      }
    }
    for (const x of parts) x.proposal.confidence = scoreConfidence(x.proposal);
    report.push(entry);
  }
  return report;
}

// ── LLM pass guard ────────────────────────────────────────────────────────────

export const LLM_FIELDS = ['is_translation', 'translator_display', 'series_raw', 'volume', 'publication_year', 'publisher', 'place'];

/**
 * Accept only model fields whose `evidence` is a verbatim substring of the
 * row's own provenance text (after the same `clean()` normalisation, compared
 * case-sensitively), and whose value itself appears in that evidence where it
 * is a name or a string. Never accepts a translator or edition that is not in
 * the text. Returns { accepted: {field: {value, evidence}}, rejected: [{field, why}] }.
 */
export function acceptLlmFields(row, modelOut) {
  const source = FIELDS.map(f => clean(row[f])).join(' \n ');
  const accepted = {};
  const rejected = [];
  for (const field of LLM_FIELDS) {
    const entry = modelOut?.[field];
    if (!entry || entry.value === null || entry.value === undefined || entry.value === '') continue;
    const evidence = clean(entry.evidence || '');
    if (!evidence || evidence.length < 3) { rejected.push({ field, why: 'no evidence' }); continue; }
    if (!source.includes(evidence)) { rejected.push({ field, why: 'evidence not verbatim in provenance text' }); continue; }
    if (typeof entry.value === 'string' && field !== 'series_raw') {
      const parts = entry.value.split(/\s*(?:&|,| and )\s*/).filter(Boolean);
      const surnames = parts.map(n => n.trim().split(/\s+/).pop());
      if (!surnames.every(s => evidence.includes(s))) { rejected.push({ field, why: 'value not in its evidence' }); continue; }
    }
    if (typeof entry.value === 'number' && !evidence.includes(String(entry.value)) && !(field === 'volume' && evidenceHasRoman(evidence, entry.value))) {
      rejected.push({ field, why: 'number not in its evidence' });
      continue;
    }
    accepted[field] = { value: entry.value, evidence };
  }
  return { accepted, rejected };
}

function evidenceHasRoman(evidence, n) {
  return (evidence.match(/\b[IVXLC]+\b/g) || []).some(r => romanToInt(r) === n);
}

// ── Sourced and editor-confirmed fields ───────────────────────────────────────

export const SOURCED_FIELDS = ['is_translation', 'translator_display', 'series_key', 'volume', 'publication_year', 'publisher', 'place'];

/**
 * Check one entry of the curated sourced-fields file. Two bases:
 *   "source": a field looked up in an outside citation. Every string or number
 *             value must appear in the entry's verbatim `citation` (a volume may
 *             appear as a Roman numeral), and the entry must name its `source_url`.
 *   "editor": a value the editor confirmed by hand; it needs a `note` saying so.
 * Returns { ok: {field: value}, refused: [{field, why}] }.
 */
export function checkSourcedEntry(entry) {
  const ok = {};
  const refused = [];
  const fields = entry?.fields || {};
  for (const [field, value] of Object.entries(fields)) {
    if (!SOURCED_FIELDS.includes(field)) { refused.push({ field, why: 'not a proposable field' }); continue; }
    if (entry.basis === 'editor') {
      if (!entry.note) { refused.push({ field, why: 'editor entry without a note' }); continue; }
      ok[field] = value;
      continue;
    }
    if (entry.basis !== 'source') { refused.push({ field, why: `unknown basis "${entry.basis}"` }); continue; }
    if (!entry.source_url || !entry.citation) { refused.push({ field, why: 'source entry needs source_url and citation' }); continue; }
    const cite = clean(entry.citation);
    if (typeof value === 'boolean' || field === 'series_key') { ok[field] = value; continue; }
    if (typeof value === 'number') {
      if (cite.includes(String(value)) || (field === 'volume' && evidenceHasRoman(cite, value))) ok[field] = value;
      else refused.push({ field, why: 'number not in citation' });
      continue;
    }
    const parts = String(value).split(/\s*(?:&| and |,)\s*/).filter(Boolean);
    if (parts.every(n => cite.includes(n))) ok[field] = value;
    else refused.push({ field, why: 'value not in citation' });
  }
  return { ok, refused };
}
