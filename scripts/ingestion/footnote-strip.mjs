/**
 * footnote-strip.mjs — deterministic orphaned-footnote-marker removal
 *
 * Called by clean-archive-ocr.mjs as part of OCR cleaning. OCR frequently keeps
 * a footnote's superscript marker (^, *, †, digit…) while losing the footnote
 * text itself, leaving an orphaned marker glued to a word. Their shape is
 * predictable, so — unlike character substitutions (see detect-scannos.mjs) —
 * this is safe to strip silently and unattended. A wrong deletion costs one
 * stray character; we accept that in exchange for scale, and do NOT convert to
 * markdown footnotes.
 *
 * Pure and deterministic: same input → same output. No I/O, no dependencies.
 */

import { DEFAULT_FOOTNOTE_MARKERS, STRIP_FOOTNOTE_MARKERS } from './archive-ocr-config.mjs';

// Unicode superscript digits (¹²³⁰⁴⁵⁶⁷⁸⁹) — always footnote marks when glued to a word.
const SUPERSCRIPT_DIGITS = '¹²³⁰⁴⁵⁶⁷⁸⁹';

// Characters that may end a word before a marker (whitespace / closing punctuation / EOL).
const TERMINATOR = `(?=$|[\\s.,;:!?)\\]"'’”»])`;

// Private-use sentinels used to hide [^id] footnotes during processing.
const MASK_OPEN = '\uE000';
const MASK_CLOSE = '\uE001';

function escapeForClass(ch) {
  return ch.replace(/[\^\]\\-]/g, '\\$&');
}

// Lines inside fenced code blocks or tables are passed through untouched.
function computeProtectedLines(lines) {
  const prot = new Array(lines.length).fill(false);
  let inFence = false;
  const isDelim = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(l);
  const hasPipe = (l) => /(?:^|[^\\])\|/.test(l);
  const isBlank = (l) => /^\s*$/.test(l);

  for (let i = 0; i < lines.length; i++) {
    if (/^\s{0,3}(`{3,}|~{3,})/.test(lines[i])) {
      prot[i] = true;
      inFence = !inFence;
      continue;
    }
    if (inFence) prot[i] = true;
  }

  for (let i = 0; i < lines.length; i++) {
    if (!isDelim(lines[i])) continue;
    prot[i] = true;
    for (let j = i - 1; j >= 0 && hasPipe(lines[j]) && !isBlank(lines[j]); j--) prot[j] = true;
    for (let j = i + 1; j < lines.length && hasPipe(lines[j]) && !isBlank(lines[j]); j++) prot[j] = true;
  }
  return prot;
}

function countUnescaped(line, ch) {
  let n = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ch && line[i - 1] !== '\\') n++;
  }
  return n;
}

/**
 * Strip orphaned footnote markers from OCR text.
 * @param {string} text
 * @param {object} [config] - may carry `footnoteMarkers` and `stripFootnoteMarkers`
 * @returns {{ text: string, count: number }}
 */
export function stripFootnoteMarkers(text, config = {}) {
  const enabled = config.stripFootnoteMarkers ?? STRIP_FOOTNOTE_MARKERS;
  if (!enabled) return { text, count: 0 };

  const markers = config.footnoteMarkers ?? DEFAULT_FOOTNOTE_MARKERS;
  const emphasis = markers.filter((m) => m === '*' || m === '_');
  const symbols = markers.filter((m) => m !== '*' && m !== '_');
  const symbolClass = symbols.map(escapeForClass).join('');

  const symbolAbut = symbolClass ? new RegExp(`(\\p{L})[${symbolClass}]+${TERMINATOR}`, 'gu') : null;
  const symbolIsolated = symbolClass ? new RegExp(`(^|\\s)[${symbolClass}]+(?=\\s|$)`, 'gu') : null;
  const superscript = new RegExp(`(\\p{L})[${SUPERSCRIPT_DIGITS}]+`, 'gu');
  // Letter + 1–2 digits + boundary, where the boundary is NOT ':' or another
  // digit — so verse refs (John3:16), long numbers, and Psalm119 are protected.
  const asciiDigit = /(\p{L})\d{1,2}(?=$|[\s.,;!?)\]"'’”»])/gu;
  const restore = new RegExp(`${MASK_OPEN}(\\d+)${MASK_CLOSE}`, 'g');

  let count = 0;
  const lines = text.split('\n');
  const prot = computeProtectedLines(lines);

  for (let i = 0; i < lines.length; i++) {
    if (prot[i]) continue;
    let line = lines[i];

    // Hide well-formed markdown footnotes [^id] so nothing below can touch them.
    const masks = [];
    line = line.replace(/\[\^[^\]]*\]/g, (m) => {
      masks.push(m);
      return `${MASK_OPEN}${masks.length - 1}${MASK_CLOSE}`;
    });

    if (symbolAbut) {
      line = line.replace(symbolAbut, (m, w) => {
        count += m.length - w.length;
        return w;
      });
      line = line.replace(symbolIsolated, (m, pre) => {
        count += m.length - pre.length;
        return pre;
      });
    }

    line = line.replace(superscript, (m, w) => {
      count += m.length - w.length;
      return w;
    });

    line = line.replace(asciiDigit, (m, w) => {
      count += m.length - w.length;
      return w;
    });

    // Emphasis-ambiguous markers: strip a word-abutting marker only when the
    // delimiter is unpaired on the line (odd count) — never break *emphasis*.
    for (const ch of emphasis) {
      if (countUnescaped(line, ch) % 2 === 1) {
        const re = new RegExp(`(\\p{L})\\${ch}${TERMINATOR}`, 'u');
        const before = line;
        line = line.replace(re, (_, w) => w);
        if (line !== before) count += 1;
      }
    }

    line = line.replace(restore, (_, idx) => masks[Number(idx)]);
    lines[i] = line;
  }

  return { text: lines.join('\n'), count };
}
