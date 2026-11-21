import test from 'node:test'
import assert from 'node:assert/strict'
import { readingMinutes, readingTime, wordCount } from './reading-time'

// The cases below were executed against the live Postgres (2026-09-21, and the
// footnote cases on 2026-11-21) using the generated-column expression, now migration 043's:
//
//   array_length(regexp_split_to_array(regexp_replace(
//     regexp_replace(regexp_replace(body, '^\[\^[^]]+\]:.*$', '', 'gn'), '\[\^[^]]+\]', '', 'g'),
//   '^\s+|\s+$', '', 'g'), '\s+'), 1)
//
// and the `pg` figure here is what the database actually returned for each
// input. They are the inputs where the two languages could plausibly disagree:
// an empty body, whitespace only, a leading blank line (the case that rules out
// Postgres's `btrim`, which strips spaces but not newlines), a tab and a double
// space, and a trailing newline. If someone edits either side, this fails.
const PG_VERIFIED: [input: string, pg: number][] = [
  ['', 1],
  ['   ', 1],
  ['\n\n# Title\n\nword', 3],
  ['a  b\tc\n\nd', 4],
  ['  leading and trailing  \n', 3],
  // Footnotes (migration 043), run against the live Postgres on 2026-11-21:
  ['He went[^1] to Rome.[^2]\n\n[^1]: Acts xxviii. 14.\n[^2]: So Stephens, p. 3.\n', 4],
  ["Text with [^ed1] editor marker.\n\n[^ed1]: Editor's note here.", 4],
  ['[^1] at start\n\n[^1]: note', 2],
]

test('wordCount matches the Postgres generated column on every verified case', () => {
  for (const [input, pg] of PG_VERIFIED) {
    assert.equal(
      wordCount(input),
      pg,
      `JS and migration 028 disagree on ${JSON.stringify(input)} — ` +
        'the displayed reading time would depend on which one the page used',
    )
  }
})

test('footnotes do not count as reading', () => {
  const plain = 'He went to Rome and stayed there two whole years.'
  const noted = 'He went[^1] to Rome and stayed there two whole years.[^2]\n\n[^1]: A long note about the route, the ship, the winter at Malta and much else besides.\n[^2]: Acts xxviii. 30.\n'
  assert.equal(wordCount(noted), wordCount(plain))
})

test('a real body counts the same in both languages', () => {
  // `a-prayer-for-charity`, the shortest published text: Postgres returned 122.
  const body = Array.from({ length: 122 }, (_, i) => `word${i}`).join('\n\n')
  assert.equal(wordCount(body), 122)
})

test('minutes round up to the nearest five', () => {
  assert.equal(readingMinutes(1), 5)
  assert.equal(readingMinutes(200), 5) // exactly 1 minute → still shown as 5
  assert.equal(readingMinutes(1000), 5) // exactly 5 minutes
  assert.equal(readingMinutes(1001), 10) // just over → next step
  assert.equal(readingMinutes(2000), 10)
})

test('a missing word count reads as zero rather than guessing', () => {
  // `word_count` is null only if a query forgot to select it. Zero is visible
  // in the page; a fabricated estimate would not be.
  assert.equal(readingMinutes(null), 0)
  assert.equal(readingMinutes(undefined), 0)
  assert.equal(readingMinutes(0), 0)
  assert.equal(readingMinutes(-1), 0)
  assert.equal(readingMinutes(NaN), 0)
})

test('readingTime(body) and readingMinutes(word_count) agree', () => {
  // The two entry points must never show a different figure for the same text:
  // a listing uses the column, the reader page uses the body it already holds.
  for (const n of [1, 199, 200, 201, 1000, 1001, 5000, 99763]) {
    const body = Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
    assert.equal(readingTime(body), readingMinutes(n))
  }
})
