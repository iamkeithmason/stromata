import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNote, parseNoteRuns } from './note-inline'

test('italicises *Title* and keeps the surrounding text', () => {
  assert.deepEqual(parseNoteRuns('Prudentius’ *Psychomachia* has long held'), [
    { text: 'Prudentius’ ' },
    { text: 'Psychomachia', em: true },
    { text: ' has long held' },
  ])
})

test('handles _title_ and **bold**, but not snake_case or a lone asterisk', () => {
  assert.deepEqual(parseNoteRuns('_Confessions_ and **this**'), [
    { text: 'Confessions', em: true },
    { text: ' and ' },
    { text: 'this', strong: true },
  ])
  assert.deepEqual(parseNoteRuns('a note_draft field'), [{ text: 'a note_draft field' }])
  assert.deepEqual(parseNoteRuns('5 * 3 = 15'), [{ text: '5 * 3 = 15' }])
})

test('splits paragraphs on blank lines and joins soft line breaks', () => {
  const note = 'First *one*\ncontinues.\n\nSecond.\n\n\nThird.'
  const paras = parseNote(note)
  assert.equal(paras.length, 3)
  assert.deepEqual(paras[0], [{ text: 'First ' }, { text: 'one', em: true }, { text: ' continues.' }])
  assert.deepEqual(paras[2], [{ text: 'Third.' }])
})
