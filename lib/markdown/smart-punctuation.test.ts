import { test } from 'node:test'
import assert from 'node:assert/strict'
import { smartenText, remarkSmartPunctuation } from './smart-punctuation'

test('a double hyphen between words becomes an em dash', () => {
  assert.equal(smartenText('cursed Christ--none of which'), 'cursed Christ—none of which')
  assert.equal(smartenText('a pause -- then'), 'a pause — then')
})

test('three or more hyphens are left alone', () => {
  assert.equal(smartenText('a---b'), 'a---b')
})

test('single quotes from Pliny open and close', () => {
  assert.equal(smartenText("sang a hymn to Christ 'as to a god', bound"), 'sang a hymn to Christ ‘as to a god’, bound')
})

test('an apostrophe inside a word is a right single quote', () => {
  assert.equal(smartenText("don't and Peter's"), 'don’t and Peter’s')
})

test('double quotes open after a space and close after a word or full stop', () => {
  assert.equal(smartenText('He said "Peace be with you."'), 'He said “Peace be with you.”')
  assert.equal(smartenText('"Lord," he said'), '“Lord,” he said')
})

test('a quote after an opening bracket or a dash opens', () => {
  assert.equal(smartenText('("so")'), '(“so”)')
  assert.equal(smartenText('word--"quoted"'), 'word—“quoted”')
})

test('text with nothing to change comes back identical', () => {
  const s = 'It is my practice, my lord, to refer to you all matters.'
  assert.equal(smartenText(s), s)
})

test('the plugin carries context across inline formatting', () => {
  // He said *"Amen"* "again" — the closing quote after emphasis must close.
  const tree = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'the word ' },
          { type: 'emphasis', children: [{ type: 'text', value: '"Amen' }] },
          { type: 'text', value: '" was sung' },
        ],
      },
    ],
  }
  remarkSmartPunctuation()(tree)
  const p = tree.children[0].children
  assert.equal((p[1] as { children: { value: string }[] }).children[0].value, '“Amen')
  assert.equal((p[2] as { value: string }).value, '” was sung')
})

test('each paragraph starts a fresh run, so its opening quote opens', () => {
  const tree = {
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'text', value: 'ends here.' }] },
      { type: 'paragraph', children: [{ type: 'text', value: '"Begin' }] },
    ],
  }
  remarkSmartPunctuation()(tree)
  assert.equal((tree.children[1].children[0] as { value: string }).value, '“Begin')
})

test('inline code is left untouched', () => {
  const tree = {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'inlineCode', value: 'a--b "x"' }] }],
  }
  remarkSmartPunctuation()(tree)
  assert.equal((tree.children[0].children[0] as { value: string }).value, 'a--b "x"')
})
