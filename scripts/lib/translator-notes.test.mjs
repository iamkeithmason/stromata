/**
 * Tests for the translator-notes backfill. The fixtures are real: the opening of On the Priesthood,
 * Book I, as CCEL prints NPNF I/9 and as New Advent's revision (our body) gives it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alignEditionNotes, applyNotes, isScriptureOnly, locateSpan, looksGarbled, norm, parseVolumeNumber, placeMarkers, readDefinitions,
  stripNotes, volumeFor, withoutDefinitions,
} from './translator-notes.mjs'

const CCEL = `   Book I.

   1. I had many genuine and true friends, men who understood the laws of
   friendship, and faithfully observed them; but out of this large number
   there was one who excelled all the rest in his attachment to me,
   striving to outstrip them as much as they themselves outstripped
   ordinary acquaintance. He was one of those who were constantly at my
   side; for we were engaged in the same studies, and employed the same
   teachers. [42] We had the same eagerness and zeal about the studies at
   which we worked. But when it became our duty to pursue the blessed life
   of monks, and the true philosophy, [43] our balance was no longer even.
   If thou wert thyself ambitious of obtaining this office, thy fear would
   have been reasonable, as the Lord saith, Lovest thou Me more than these? [70]
   Yet He might have said to him: If thou lovest Me practise fasting.
     __________________________________________________________________

   [42] Androgathius in philosophy, Libanius in rhetoric.

   [43] An expression frequently employed by St. Chrysostom in the sense
   of a life of religious contemplation and study.

   [70] In some editions the words "tend my sheep" are added here.
`

const BODY = `I had many genuine and true friends, men who understood the laws of friendship, and faithfully observed them; but out of this large number there was one who excelled all the rest in his attachment to me, striving to outstrip them as much as they themselves outstripped ordinary acquaintance. He was one of those who were constantly at my side; for we were engaged in the same studies, and employed the same teachers. We had the same eagerness and zeal about the studies at which we worked. But when it became our duty to pursue the blessed life of monks, and the true philosophy, our balance was no longer even. If you were yourself ambitious of obtaining this office, your fear would have been reasonable, as the Lord says, [Do you love Me more than these?](https://www.newadvent.org/bible/joh021.htm) Yet He might have said to him: If you love Me practise fasting.
`

test('the cited volume is read from the attribution, both citation styles', () => {
  assert.equal(volumeFor('Translated by John Gibb and James Innes (NPNF, Series I, Vol. VII).'), 'npnf107')
  assert.equal(volumeFor('Translated by Edwin Hamilton Gifford. From Nicene and Post-Nicene Fathers, Second Series, Vol. 7.'), 'npnf207')
  assert.equal(volumeFor('Translated by Frederick Crombie (ANF, Vol. IV).'), 'anf04')
  assert.equal(volumeFor('Translated by Allan Menzies (ANF, Vol. X — Additional Volume).'), 'anf10')
  // No series named: Schaff alone is Series I; Wace is credited only on Series II.
  assert.equal(volumeFor('From Nicene and Post-Nicene Fathers, Vol. 1. Edited by Philip Schaff.'), 'npnf101')
  assert.equal(volumeFor('From Nicene and Post-Nicene Fathers, Vol. 3. Edited by Philip Schaff and Henry Wace.'), 'npnf203')
  assert.equal(volumeFor('Translated by W.R.W. Stephens. From Nicene and Post-Nicene Fathers, First Series, Vol. 9\\. Edited by Philip Schaff.'), 'npnf109')
  assert.equal(volumeFor('Text supplied from a personal archive.'), null)
  assert.equal(parseVolumeNumber('XIV'), 14)
})

test('archaic forms compare equal to New Advent\'s modernised ones', () => {
  assert.equal(norm('thou'), norm('you'))
  assert.equal(norm('desireth'), norm('desires'))
  assert.equal(norm('hast'), norm('have'))
  assert.notEqual(norm('these'), norm('this'))
})

test('the span is found by its first and last words, and definitions are not part of it', () => {
  const span = locateSpan(CCEL, BODY)
  assert.ok(span && span.startsWith('I had many'))
  assert.ok(!/Androgathius/.test(withoutDefinitions(CCEL)))
})

test('every marker is placed after the words it glosses, through links and modernisation', () => {
  const { placed, unmatched, total } = placeMarkers(locateSpan(CCEL, BODY), BODY)
  assert.equal(total, 3)
  assert.deepEqual(unmatched, [])
  const at = n => BODY.slice(0, placed.find(p => p.n === n).at)
  assert.ok(at(42).endsWith('employed the same teachers.'))
  assert.ok(at(43).endsWith('and the true philosophy,'))
  // Reordered words before it ("Lovest thou Me" → "Do you love Me"): placed by the words after, past the link.
  assert.ok(at(70).endsWith('(https://www.newadvent.org/bible/joh021.htm)'))
})

test('a definition stops at a section rule that follows it with no blank line', () => {
  const defs = readDefinitions('   text\n\n   [9] Statuum.\n     ______________________________\n\n   Next section.\n')
  assert.equal(defs.get(9), 'Statuum.')
})

test('a wrapped line that begins with a marker is text, not a definition', () => {
  const wrapped = CCEL.replace('the same\n   teachers. [42] We had', 'the same teachers.\n   [42] We had')
  assert.equal(readDefinitions(wrapped).get(42), 'Androgathius in philosophy, Libanius in rhetoric.')
  assert.match(withoutDefinitions(wrapped), /\[42\] We had the same eagerness/)
})

test('the span reaches the last word even with many markers before it', () => {
  const span = locateSpan(CCEL, BODY)
  assert.ok(/practise fasting$/.test(span.trimEnd()), span.slice(-40))
})

test('a sentence that is not in the body leaves its marker unplaced, never guessed', () => {
  const other = CCEL.replace('and the true philosophy, [43] our balance was no longer even.', 'and something wholly other is said, [43] which no copy of the body contains at all.')
  const { unmatched } = placeMarkers(locateSpan(other, BODY), BODY)
  assert.deepEqual(unmatched.map(u => u.n), [43])
})

test('notes are inserted in reading order and the body is otherwise byte-identical', () => {
  const defs = readDefinitions(CCEL)
  assert.equal(defs.get(43), 'An expression frequently employed by St. Chrysostom in the sense of a life of religious contemplation and study.')
  const { placed } = placeMarkers(locateSpan(CCEL, BODY), BODY)
  const out = applyNotes(BODY, placed, defs)
  assert.equal(out.notes, 3)
  assert.match(out.body, /same teachers\.\[\^1\] We had/)
  assert.match(out.body, /\n\n\[\^1\]: Androgathius in philosophy, Libanius in rhetoric\.\n\[\^2\]: /)
  assert.equal(stripNotes(out.body).trimEnd(), BODY.trimEnd())
})

test('a note that is only a Scripture reference is recognised', () => {
  assert.ok(isScriptureOnly('John xxi. 15-17.'))
  assert.ok(isScriptureOnly('Rom. viii. 32; John iii. 16.'))
  assert.ok(isScriptureOnly('1 Sam. x. 23.'))
  assert.ok(!isScriptureOnly('Androgathius in philosophy, Libanius in rhetoric.'))
  assert.ok(!isScriptureOnly('Matt. xxiv. 45. Some mss. of Chrysostom have the future here.'))
})

test('looksGarbled flags Greek turned into Windows smart characters, and leaves clean notes alone', () => {
  // Real CCEL lines from NPNF I/9 (On the Priesthood), fixed in print/on-the-priesthood/corrections.json.
  assert.equal(looksGarbled('οἱ την ›ιμαρμν™ην ἐισ€γοντες'), true)
  assert.equal(looksGarbled('κατ™στησε'), true)
  assert.equal(looksGarbled('‡φείλετο'), true)
  assert.equal(looksGarbled('οἱ τὴν εἱμαρμένην εἰσάγοντες'), false)
  assert.equal(looksGarbled('“See,” he says, ‘the Lord’s’ word — Matt. xxiv. 45.'), false)
})

test('alignEditionNotes pairs by order, keeps the Greek, and refuses a different note', () => {
  const ccel = new Map([[42, 'Androgathius in philosophy, Libanius in rhetoric.'], [154, '"hoi ten >imarmn?en eis?gontes," sc. The Stoics.'], [88, 'A note. And its second paragraph.']])
  const edition = ['Androgathius in philosophy, Libanius in rhetoric.', '“οἱ τὴν εἱμαρμένην εἰσάγοντες,” sc. The Stoics.', 'A note.']
  // too short to trust as a prefix: refused
  assert.equal(alignEditionNotes([42, 154, 88], ccel, edition).ok, false)
  const long = 'A long note about the Eucharist that the edition cut at a paragraph break, as on 21 Nov 2026.'
  ccel.set(88, `${long} The rest of it.`)
  const ok = alignEditionNotes([42, 154, 88], ccel, [edition[0], edition[1], long])
  assert.equal(ok.ok, true)
  assert.equal(ok.definitions.get(154), edition[1])
  assert.equal(ok.definitions.get(88), `${long} The rest of it.`)
  assert.deepEqual(ok.longerInCcel, [88])
  assert.equal(alignEditionNotes([42, 88], ccel, [long, edition[0]]).ok, false) // out of order
  // Eubœa in the edition, Euboea in CCEL: the same note
  assert.equal(alignEditionNotes([1], new Map([[1, 'The island of Euboea and the mainland of Greece.']]), ['The island of Eubœa and the mainland of Greece.']).ok, true)
  assert.equal(alignEditionNotes([42], ccel, edition).ok, false)
})

test('transliterated Greek from CCEL plain text counts as garbled', () => {
  assert.equal(looksGarbled('"hoi ten >imarmn?en eis?gontes," sc. The Stoics.'), true)
  assert.equal(looksGarbled('Is it so? Yes.'), false)
})
