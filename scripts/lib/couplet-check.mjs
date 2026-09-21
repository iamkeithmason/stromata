/**
 * couplet-check.mjs — use the verse form itself as a checksum on a transcription.
 *
 * WHY THIS EXISTS. A page of heroic couplets carries its own redundancy: line
 * 2n and line 2n+1 rhyme. When OCR mangles the end of a line, the rhyme breaks,
 * and that break is findable without knowing what the line was supposed to say.
 * The 1743 Psychomachia is 1,200-odd lines of couplets, which is far too many
 * to read closely and exactly the right size for a machine to narrow down.
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
 * wreckage, not to spell-check an eighteenth-century poet. A word passes if it
 * has a vowel, has no run of four consonants, and is not obviously a numeral or
 * a fragment. Real words this rejects would be a bug; garbage it accepts is
 * merely a miss, and the other two guards are there for those.
 */
export function plausibleWord(word) {
  if (!word || word.length < 2) return false;
  if (!/[aeiouy]/.test(word)) return false;
  if (/[bcdfghjklmnpqrstvwxz]{4}/.test(word)) return false;
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
 * Walk a run of verse in pairs and report what wants a human eye.
 *
 * `lines` is the body only — headings and blank lines must be filtered out by
 * the caller, because a heading in the middle of the array shifts every couplet
 * after it by one and turns the whole report into noise. `offset` is the line
 * number of `lines[0]` in the finished text, so a flag can name where to look.
 */
export function checkCouplets(lines, { offset = 1, allowDigits = false } = {}) {
  const garbled = [];
  const noRhyme = [];

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

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const a = finalWord(lines[i]);
    const b = finalWord(lines[i + 1]);
    // A couplet with a garbled half is already reported, and its rhyme cannot
    // be judged. Reporting it twice would only pad the list.
    if (isGarbled.has(offset + i) || isGarbled.has(offset + i + 1)) continue;
    if (!plausibleWord(a) || !plausibleWord(b)) continue;
    if (!rhymes(a, b)) {
      noRhyme.push({
        line: offset + i,
        first: lines[i],
        second: lines[i + 1],
        endings: [a, b],
      });
    }
  }

  const pairs = Math.floor(lines.length / 2);
  return {
    garbled,
    noRhyme,
    pairs,
    // The headline number. Rising across a re-transcription is the evidence
    // that it worked; a single run's value means little on its own, because
    // the floor is set by the poem's own eye-rhymes, not by the OCR.
    rhymeRate: pairs ? (pairs - noRhyme.length) / pairs : 1,
  };
}
