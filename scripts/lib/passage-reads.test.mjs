import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseReferences } from '../../lib/scripture/index.ts'
import { appearsIn, checkRead, normalise, parseReply, printedLiterally, promptFor, readSchema } from './passage-reads.mjs'

const themes = ['repentance', 'sacraments', 'christology']
const body = `Wash you, make you clean (Isaiah 1:16). Seest thou not the sinner? It is God's to grant grace,
but *yours* to receive and guard it. Put on the new man, which is renewed in knowledge.
Golgotha stands before you, and the penitent robber.`

const base = {
  argument: 'Grace is free but asks a sincere purpose.',
  questions: ['How should one prepare for baptism?'],
  moves: ['exhortation', 'catechesis'],
  named: ['Golgotha', 'the penitent robber'],
  scripture_cited: [],
  scripture_uncited: [],
  key_terms: ['Seal'],
  quotable: [],
  flags: [],
  theme_check: { fits: ['repentance'], weak: [], suggested: [], gaps: [] },
}
const check = (reply) => checkRead(reply, { body, bodyRefs: parseReferences(body), parseRefs: parseReferences, themes })

test('a cited reference printed in the text is kept', () => {
  const { read, dropped } = check({ ...base, scripture_cited: [{ ref: 'Isa 1:16' }] })
  assert.deepEqual(read.scripture_cited.map((s) => s.ref), ['Isa 1:16'])
  assert.equal(dropped.length, 0)
})

test('a cited reference not printed in the text is dropped (the Prov 10:24 case)', () => {
  const { read, dropped } = check({ ...base, scripture_cited: [{ ref: 'Prov 10:24' }, { ref: 'Isa 1:17' }] })
  assert.equal(read.scripture_cited.length, 0)
  assert.deepEqual(dropped.map((d) => d.value), ['Prov 10:24', 'Isa 1:17'])
})

test('an uncited quotation is kept only when its words are in the body', () => {
  const { read, dropped } = check({
    ...base,
    scripture_uncited: [
      { ref: 'Col 3:10', quote: 'the new man, which is renewed in knowledge' },
      { ref: 'Ps 46:10', quote: 'Be still, and know that I am God' },
    ],
  })
  assert.deepEqual(read.scripture_uncited.map((s) => s.ref), ['Col 3:10'])
  assert.equal(dropped[0].value.startsWith('Ps 46:10'), true)
})

test('an "uncited" verse whose reference is printed moves to cited', () => {
  const { read } = check({ ...base, scripture_uncited: [{ ref: 'Isa 1:16', quote: 'Wash you, make you clean' }] })
  assert.equal(read.scripture_uncited.length, 0)
  assert.deepEqual(read.scripture_cited.map((s) => s.ref), ['Isa 1:16'])
})

test('quotations must be word for word, ignoring emphasis, quotes and spacing', () => {
  const { read, dropped } = check({
    ...base,
    quotable: ["it is God’s to grant grace, but yours to receive and guard it", 'grace is cheap'],
  })
  assert.equal(read.quotable.length, 1)
  assert.equal(dropped[0].field, 'quotable')
})

test('names the body does not hold are dropped', () => {
  const { read, dropped } = check({ ...base, named: ['Golgotha', 'Polycarp'] })
  assert.deepEqual(read.named, ['Golgotha'])
  assert.equal(dropped[0].value, 'Polycarp')
})

test('themes outside the vocabulary are dropped; gaps are free text', () => {
  const { read, dropped } = check({ ...base, theme_check: { fits: ['repentance', 'baptism'], weak: [], suggested: ['sacraments'], gaps: ['education'] } })
  assert.deepEqual(read.theme_check.fits, ['repentance'])
  assert.deepEqual(read.theme_check.gaps, ['education'])
  assert.equal(dropped[0].value, 'baptism')
})

test('an unusable reply is refused, not stored', () => {
  assert.deepEqual(check(null).problems, ['Reply is not a JSON object.'])
  assert.deepEqual(check({ ...base, argument: '' }).problems, ['argument is missing.'])
})

test('parseReply finds the object inside a fenced reply', () => {
  assert.deepEqual(parseReply('```json\n{"a":1}\n```'), { a: 1 })
  assert.equal(parseReply('no json'), null)
})

test('the prompt carries the catalogue record and the body, nothing else', () => {
  const p = promptFor({ title: 'T', author: 'A', genre: 'Homily', themes: ['prayer'], body: 'Body here.' })
  assert.match(p, /Recorded author: A/)
  assert.match(p, /--- BODY ---\nBody here\.\n--- END OF BODY ---/)
})

test('the schema requires every field and allows nothing extra', () => {
  const s = readSchema(themes)
  assert.equal(s.additionalProperties, false)
  assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort())
})

test('normalise and appearsIn match whole words only', () => {
  assert.equal(normalise('“Flee  unto *silence*!”'), 'flee unto silence')
  assert.equal(appearsIn('the art of teaching', 'art of teach'), false)
})

test('a Vulgate Psalm number the body prints is kept, not dropped (Pastoral Rule III)', () => {
  const vbody = 'as it is said in another place, _When He slew them, then they sought Him_ Psalm 77:34. And Canticles 8:13 too.'
  const r = checkRead({ ...base, named: [], scripture_cited: [{ ref: 'Ps 77:34' }, { ref: 'Ps 78:34' }, { ref: 'Song 8:13' }, { ref: 'Ps 77:12' }] },
    { body: vbody, bodyRefs: parseReferences(vbody), parseRefs: parseReferences, themes })
  assert.deepEqual(r.read.scripture_cited.map((s) => s.ref), ['Ps 77:34', 'Ps 78:34', 'Song 8:13'])
  assert.deepEqual(r.dropped.map((d) => d.value), ['Ps 77:12'])
})

test('printedLiterally keeps numbered books apart', () => {
  assert.equal(printedLiterally('see 1 Corinthians 15:53 here', '1 Cor 15:53'), true)
  assert.equal(printedLiterally('see 1 Chronicles 15:53 here', '1 Cor 15:53'), false)
})

import { checkSection, rollUpThemes, sectionSchema, splitSections } from './passage-reads.mjs'

const para = (n, w = 'word') => Array.from({ length: n }, () => w).join(' ')

test('splitSections cuts on headings, merges short chapters and keeps every word', () => {
  const body = [`## One\n\n${para(3000)}`, `## Two\n\n${para(200)}`, `## Three\n\n${para(2500)}`].join('\n\n')
  const s = splitSections(body)
  assert.equal(s.length, 2)
  assert.equal(s[0].label, 'One to Two')
  assert.equal(s[1].label, 'Three')
  const words = (x) => (x.match(/\S+/g) ?? []).length
  assert.equal(s.reduce((n, x) => n + x.words, 0), words(body))
})

test('splitSections chunks a body with no headings at paragraph breaks', () => {
  const body = Array.from({ length: 30 }, () => para(500)).join('\n\n')
  const s = splitSections(body)
  assert.ok(s.length >= 3)
  assert.ok(s.every((x) => x.words <= 8000))
  assert.equal(s[0].label, 'Part 1')
})

test('a section read keeps vocabulary themes and printed references only', () => {
  const section = { label: 'Part 1', starts_with: 'x', words: 40, body: 'Wash you, make you clean (Isaiah 1:16). Liberty of a Christian.' }
  const r = checkSection(
    { summary: 'On washing.', themes: ['repentance', 'liberty'], topics: ['Christian liberty'], scripture_cited: [{ ref: 'Isa 1:16' }, { ref: 'Gal 5:1' }], scripture_uncited: [] },
    { section, bodyRefs: parseReferences(section.body), parseRefs: parseReferences, themes },
  )
  assert.deepEqual(r.section.themes, ['repentance'])
  assert.deepEqual(r.section.topics, ['Christian liberty'])
  assert.deepEqual(r.section.scripture_cited.map((x) => x.ref), ['Isa 1:16'])
  assert.deepEqual(r.dropped.map((d) => d.value), ['liberty', 'Gal 5:1'])
})

test('rollUpThemes ranks themes by the words they cover', () => {
  const r = rollUpThemes([{ words: 1000, themes: ['a', 'b'] }, { words: 5000, themes: ['b'] }, { words: 500, themes: ['c'] }])
  assert.deepEqual(r.map((x) => x.theme), ['b', 'a', 'c'])
  assert.equal(r[0].sections, 2)
})

test('a person marked stated but not in the body is kept as recognised', () => {
  const { read, dropped } = check({ ...base, people: [{ name: 'Cyril of Jerusalem', role: 'author', basis: 'stated' }, { name: 'Golgotha', role: 'mentioned', basis: 'stated' }] })
  assert.deepEqual(read.people.map((p) => p.basis), ['recognised', 'stated'])
  assert.equal(dropped[0].field, 'people')
})

test('the section schema requires every field', () => {
  const s = sectionSchema(themes)
  assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort())
})
