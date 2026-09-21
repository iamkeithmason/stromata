/**
 * couplet-check.mjs — use the verse form itself as a checksum on a transcription.
 *
 * WHY THIS EXISTS. Heroic couplets carry their own redundancy: the lines rhyme
 * in pairs. When OCR mangles the end of a line the rhyme breaks, and that break
 * is findable without knowing what the line was supposed to say. The 1743
 * Psychomachia is 1,200-odd lines, far too many to read closely and exactly the
 * right size for a machine to narrow down.
 *
 * The scan below RESYNCHRONISES rather than pairing from a fixed index, because
 * the form is couplets-with-occasional-triplets, as eighteenth-century couplet
 * verse usually is (this printing braces each triplet in the margin). A triplet
 * is an odd number of lines, so fixed pairing goes out of phase at the first one
 * and reports every couplet after it as broken. See checkCouplets.
 *
 * WHAT IT DOES NOT DO, and this is the important part. It does not decide
 * whether a line is correct, and it never rewrites one. It ranks lines by how
 * likely they are to repay a human look. Two different signals, with very
 * different precision:
 *
 *   garbled-ending — the line ends in something that is not an English word at
 *                    all: digits, a bare consonant run, stray punctuation
 *                    ('her 15 Cie', "th' inmoſt ſoul, |"). Nearly always a real
 *                    fault. This is the signal to act on.
 *
 *   no-rhyme       — the two endings do not rhyme by the approximation below.
 *                    Noisy, ON PURPOSE. Eighteenth-century couplets rhyme by an
 *                    eighteenth-century ear: this text really does pair
 *                    seat/State, join/divine, tea/obey. A test strict enough to
 *                    reject those would be wrong about the poem, so the test is
 *                    permissive and its misses are the price. Treat a no-rhyme
 *                    flag as a suggestion to glance at the couplet, never as
 *                    evidence the line is wrong.
 *
 * So: `garbled` is close to a bug report, `noRhyme` is a reading order. Anyone
 * tempted to gate a publish on the second should read the paragraph above
 * again — the false-positive rate is a property of the genre, not a bug to fix.
 *
 * Pure — no I/O. The tests are the specification, and they are written against
 * real couplets from the 1743 scan, both the sound ones and the broken ones.
 */

/** Vowel spellings that stand for the same sound often enough to merge. */
const VOWEL_CLASSES = [
  ['a', 'ai', 'ay', 'ei', 'ey', 'eigh', 'ea'],
  ['e', 'ee', 'ea', 'ie', 'i', 'y', 'ey'],
  ['i', 'igh', 'y', 'ye', 'ie', 'ui'],
  ['o', 'oa', 'ow', 'oe', 'ou'],
  ['u', 'oo', 'ou', 'ew', 'ue', 'eu'],
];

/**
 * Strip an eighteenth-century printed word back to letters.
 *
 * The apostrophe in `bestow'd` / `flatt'ring` marks elision, not a word
 * boundary, so it is removed rather than split on. The long s is folded here
 * too: a transcription may legitimately carry either `ſ` or `s`, and a rhyme
 * test that treated them as different letters would flag every other couplet.
 */
export function normaliseWord(raw) {
  return String(raw)
    .toLowerCase()
    .replace(/ſ/g, 's')
    .replace(/[’']/g, '')
    .replace(/[^a-z]/g, '');
}

/**
 * The letters of the last real token on a line.
 *
 * Pure punctuation is skipped, because `beheld |` ends on the word. Anything
 * carrying a letter or a digit is NOT skipped, and that distinction is the
 * whole value of this function: an earlier version walked backwards until it
 * found something word-shaped, so `of flame : E M4` returned `flame` and the
 * line looked sound. Junk at the end of a line has to be what this reports, or
 * the garbled check downstream can never fire.
 */
export function finalWord(line) {
  const tokens = String(line).trim().split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (!/[a-z0-9]/i.test(tokens[i])) continue;
    return normaliseWord(tokens[i]);
  }
  return '';
}

/**
 * Does the line end in something that could be an English word?
 *
 * Deliberately crude and deliberately generous: the point is to catch OCR
 * wreckage, not to spell-check an eighteenth-century poet. Real words this
 * rejects are a bug; garbage it accepts is merely a miss, and the other guards
 * are there for those.
 *
 * The consonant-run threshold is 5 AFTER digraphs are collapsed, and it was 4
 * before them. That earlier rule reported seven faults in the re-read
 * Psychomachia and every one was a word: `constrain` (nstr), `o'erthrown` and
 * `overthrows` (rthr), `o'erspreads` (rspr). English has four-consonant
 * clusters, and `th` is one sound written with two letters. A checker that
 * cries wolf on `constrain` costs more than the junk it catches, because the
 * whole value of this list is that everything on it is worth opening.
 */
const DIGRAPHS = /th|sh|ch|ph|wh|gh|ck|ng|qu/g;

export function plausibleWord(word) {
  if (!word || word.length < 2) return false;
  if (!/[aeiouy]/.test(word)) return false;
  if (/[bcdfghjklmnpqrstvwxz]{5}/.test(word.replace(DIGRAPHS, 'C'))) return false;
  return true;
}

/**
 * Reduce a word to the part that carries its rhyme.
 *
 * From the last vowel cluster to the end, with a silent final `e` dropped first
 * so that `state` reduces on its `a` and not on the mute letter after it. The
 * vowel cluster is then replaced by the index of its equivalence class, so
 * `seat` and `state` can be compared without a pronunciation dictionary.
 * Returns null when the word has no vowel to work from.
 */
export function rime(word) {
  let w = normaliseWord(word);
  if (!w) return null;
  // Spellings where a letter in the coda is not a sound. Without these the
  // poem's plainest rhymes fail on orthography alone: mind/design'd differ by
  // a silent g, horse/force by the c that spells the same /s/, unite/light by
  // the gh. Each is a whole class of couplet, not a special case.
  w = w
    .replace(/ce$/, 'se')
    .replace(/igh/g, 'i')
    .replace(/gn/g, 'n')
    .replace(/ck$/, 'k');
  // Silent terminal e: `state` -> `stat`, but not `the` or `be`, where the e is
  // the only vowel and dropping it leaves nothing to rhyme on.
  if (/[^aeiou]e$/.test(w) && /[aeiou]/.test(w.slice(0, -1))) w = w.slice(0, -1);
  const m = /([aeiouy]+)([^aeiouy]*)$/.exec(w);
  if (!m) return null;
  const [, vowels, tail] = m;
  const cls = VOWEL_CLASSES.findIndex((set) => set.includes(vowels));
  // Doubled final consonants are a printing habit, not a sound.
  const coda = tail.replace(/(.)\1$/, '$1');
  return `${cls === -1 ? vowels : `v${cls}`}|${coda}`;
}

/**
 * Do two line-endings rhyme, on the permissive reading described at the top?
 *
 * Three ways to pass, in descending confidence: the reduced rimes match; the
 * words simply end the same way (catches everything the vowel classes miss);
 * or they share a final consonant cluster and both vowels belong to some common
 * class. Identical words are NOT a rhyme — the couplet that repeats its own
 * end-word is nearly always a transcription that duplicated a line.
 */
export function rhymes(a, b) {
  const wa = normaliseWord(a);
  const wb = normaliseWord(b);
  if (!wa || !wb) return false;
  if (wa === wb) return false;

  const ra = rime(wa);
  const rb = rime(wb);
  if (ra && rb && ra === rb) return true;

  // Orthographic tail match — three letters is enough to be meant.
  if (wa.length >= 3 && wb.length >= 3 && wa.slice(-3) === wb.slice(-3)) return true;

  // Same coda, vowels that share any class: seat/state, join/divine.
  if (ra && rb) {
    const [va, ca] = ra.split('|');
    const [vb, cb] = rb.split('|');
    if (ca === cb && ca.length > 0 && va !== vb) {
      const sa = VOWEL_CLASSES.filter((s) => s.includes(va.replace(/^v\d+$/, ''))).length;
      const sb = VOWEL_CLASSES.filter((s) => s.includes(vb.replace(/^v\d+$/, ''))).length;
      if (sa && sb) return true;
    }
  }
  return false;
}

/**
 * Walk a run of verse and report what wants a human eye.
 *
 * `lines` is the body only — headings, blockquotes and blank lines must be
 * filtered out by the caller. `offset` is the line number of `lines[0]` in the
 * finished text, so a flag can name where to look.
 */
export function checkCouplets(lines, { offset = 1, allowDigits = false } = {}) {
  const garbled = [];
  const noRhyme = [];
  const triplets = [];

  lines.forEach((line, i) => {
    const w = finalWord(line);
    // A numeral anywhere in the line, not just at its end. This poem contains
    // no digits at all, so every one the scanner produced is a page number, a
    // signature mark or a speck that landed inside the verse — and it is
    // usually nowhere near the line ending, which is why an end-of-line test
    // alone missed `down her 15 Cie`. Texts that really do number things can
    // turn this off.
    if (!allowDigits && /\d/.test(line)) {
      garbled.push({ line: offset + i, text: line, reason: 'digits', ending: w || '(none)' });
      return;
    }
    if (!plausibleWord(w)) {
      garbled.push({ line: offset + i, text: line, reason: 'ending', ending: w || '(none)' });
    }
  });

  const isGarbled = new Set(garbled.map((g) => g.line));
  const end = (i) => finalWord(lines[i] ?? '');
  const usable = (i) => i < lines.length && !isGarbled.has(offset + i) && plausibleWord(end(i));

  // A RESYNCHRONISING scan, and the resync is the whole point.
  //
  // Pairing rigidly from index 0 assumes the poem is couplets all the way
  // down. It is not: eighteenth-century couplet verse drops into a TRIPLET
  // every so often, and this printing marks each one with a brace in the
  // margin. A triplet is an odd number of lines, so a fixed pairing goes out
  // of phase at the first one and every couplet after it reads as a failure.
  // That is not a quibble — on the re-read Psychomachia it was the difference
  // between 57% and the real figure, and it would have been read as the
  // transcription's fault rather than the checker's.
  //
  // So: walk forward, take a couplet where two lines rhyme, take a triplet
  // where three do, and where neither holds, step ONE line and try again.
  // Stepping one is what lets the scan recover its footing after an oddity
  // instead of mis-reporting everything downstream.
  let couplets = 0;
  let i = 0;
  while (i + 1 < lines.length) {
    if (!usable(i) || !usable(i + 1)) {
      i += 1;
      continue;
    }
    if (rhymes(end(i), end(i + 1))) {
      if (usable(i + 2) && rhymes(end(i + 1), end(i + 2))) {
        triplets.push({ line: offset + i, endings: [end(i), end(i + 1), end(i + 2)] });
        i += 3;
      } else {
        couplets += 1;
        i += 2;
      }
      continue;
    }
    // Out of step. If the next line pairs with the one after it, this line is
    // the odd one out — record it and resync rather than dragging the error
    // through the rest of the poem.
    if (usable(i + 2) && rhymes(end(i + 1), end(i + 2))) {
      noRhyme.push({ line: offset + i, text: lines[i], endings: [end(i), end(i + 1)], resynced: true });
      i += 1;
      continue;
    }
    noRhyme.push({ line: offset + i, text: lines[i], endings: [end(i), end(i + 1)], resynced: false });
    i += 2;
  }

  const groups = couplets + triplets.length + noRhyme.length;
  return {
    garbled,
    noRhyme,
    triplets,
    couplets,
    pairs: groups,
    // The headline number. Meaningful next to the SAME text read another way
    // — the floor is set by the poem's own eye-rhymes, not by the OCR.
    rhymeRate: groups ? (couplets + triplets.length) / groups : 1,
  };
}
