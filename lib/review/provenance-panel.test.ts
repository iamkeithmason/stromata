import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProvenancePanel, sourceHost, yearsIn, acquisitionMethod } from './provenance-panel'

const complete = {
  sourceUrl: 'https://www.newadvent.org/fathers/3101.htm',
  sourceAttribution: 'Translated by Philip Schaff (NPNF).',
  provenanceNotes: 'Sourced from New Advent. Accessed October 2026.',
  translationNotes: 'Schaff (1819–1893). 1887; public domain.',
  authorDeathYear: 430,
}

test('a complete pre-1900 record is ok with no flags', () => {
  const m = buildProvenancePanel(complete)
  assert.equal(m.status, 'ok')
  assert.deepEqual(m.flags, [])
  assert.equal(m.rows.find(r => r.label === 'Dates in translation notes')?.value, '1819, 1893, 1887')
  assert.equal(m.rows.find(r => r.label === 'Acquisition method')?.value, 'newadvent.org')
})

test('missing fields are flagged as incomplete, not unsafe', () => {
  const m = buildProvenancePanel({ authorDeathYear: 600 })
  assert.equal(m.status, 'incomplete')
  assert.equal(m.flags.length, 3)
  assert.ok(m.flags.every(f => f.severity === 'missing'))
})

test('unknown or post-1900 death year is unsafe', () => {
  assert.equal(buildProvenancePanel({ ...complete, authorDeathYear: null }).status, 'unsafe')
  assert.equal(buildProvenancePanel({ ...complete, authorDeathYear: 1911 }).status, 'unsafe')
})

test('a translation year after 1928 prompts a check but is not unsafe', () => {
  const m = buildProvenancePanel({ ...complete, translationNotes: 'Sedgefield (d. 1945), ed. 1900.' })
  assert.equal(m.status, 'ok')
  assert.match(m.flags[0].message, /1945/)
})

test('a licensed text without attribution and URL is unsafe', () => {
  const m = buildProvenancePanel({ license: 'cc-by-sa-4.0', authorDeathYear: 2000 })
  assert.equal(m.status, 'unsafe')
})

test('a licensed text with attribution and URL carries no rights flag', () => {
  const m = buildProvenancePanel({ ...complete, license: 'cc-by-sa-4.0', authorDeathYear: 2000 })
  assert.equal(m.status, 'ok')
})

test('a published text with problems leads with a warning', () => {
  const m = buildProvenancePanel({ authorDeathYear: 600, published: true })
  assert.equal(m.flags[0].severity, 'unsafe')
  assert.equal(m.status, 'unsafe')
})

test('helpers', () => {
  assert.equal(sourceHost('ftp://x.org'), null)
  assert.equal(sourceHost('not a url'), null)
  assert.equal(sourceHost('https://www.archive.org/x'), 'archive.org')
  assert.deepEqual(yearsIn('d. 1893, ed. 1887, 1893'), [1893, 1887])
  assert.deepEqual(yearsIn('none'), [])
  assert.equal(acquisitionMethod({ sourceUrl: 'https://archive.org/download/x', ocrQuality: 'low' }), 'Archive.org, OCR quality low')
})
