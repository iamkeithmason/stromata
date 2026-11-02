import test from 'node:test'
import assert from 'node:assert/strict'
import { selectSample, chunkSections, evidenceInPassage, labelKey, normaliseConcepts, analyse, uniqueLabels, resolveGroups, groupOfFrom } from './concept-pilot.mjs'

const row = (slug, author, era, tradition, genre, word_count = 3000) => ({ slug, author, era, tradition, genre, word_count })

test('selectSample: one per author, spreads dimensions, honours word limits, deterministic', () => {
  const rows = [
    row('a1', 'A', 'ante-nicene', 'early-church', 'Letter'),
    row('a2', 'A', 'ante-nicene', 'early-church', 'Letter'),
    row('b1', 'B', 'reformation', 'lutheran', 'Treatise'),
    row('c1', 'C', 'modern', 'methodist', 'Sermon'),
    row('d1', 'D', 'modern', 'methodist', 'Sermon', 90000),
    row('e1', 'E', 'modern', 'methodist', 'Sermon', 100),
  ]
  const s = selectSample(rows, { n: 3 })
  assert.equal(s.length, 3)
  assert.equal(new Set(s.map(r => r.author)).size, 3)
  assert.ok(!s.some(r => ['d1', 'e1'].includes(r.slug)))
  assert.deepEqual(s.map(r => r.slug), selectSample(rows, { n: 3 }).map(r => r.slug))
})

test('chunkSections: splits on headings, merges tiny runs, ids are stable', () => {
  const big = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ')
  const body = `## One\n\n${big}\n\n## Two\n\ntiny\n\n## Three\n\n${big}`
  const a = chunkSections(body, { target: 500, min: 100 })
  assert.deepEqual(a.map(c => c.id), ['s01', 's02'])
  assert.ok(a[0].text.includes('## One') && a[1].text.includes('tiny') && a[1].text.includes('## Three'))
  assert.deepEqual(chunkSections(body, { target: 500, min: 100 }), a)
})

test('chunkSections: splits one huge headingless section at paragraphs', () => {
  const para = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ')
  const body = [para, para, para, para, para, para].join('\n\n')
  const c = chunkSections(body, { target: 500, min: 100 })
  assert.ok(c.length >= 2)
  assert.equal(c.reduce((n, x) => n + x.words, 0), 1200)
})

test('evidenceInPassage: tolerant of case/punctuation, rejects invented or too-short quotes', () => {
  const p = 'He who would pray must first, in humility, put off the old man.'
  assert.ok(evidenceInPassage('in humility, put off the OLD man', p))
  assert.ok(!evidenceInPassage('put on the new man entirely', p))
  assert.ok(!evidenceInPassage('old man', p))
  assert.ok(!evidenceInPassage('the old man', p))
})

test('labelKey merges simple plural/case variants', () => {
  assert.equal(labelKey('Spiritual Warfares'), labelKey('spiritual warfare'))
  assert.equal(labelKey("Christ's obedience"), labelKey('christ obedience'))
  assert.equal(labelKey('Works of mercy'), labelKey('work of mercies'))
})

test('analyse: theme overlap needs whole words, not prefixes', () => {
  const c = l => ({ label: l, gloss: 'g', evidence: 'e e e e e e' })
  const out = analyse([{ slug: 't', sections: [{ id: 's01', concepts: [c('restitution of all things'), c('justification by faith')] }] }], ['rest', 'justice'])
  assert.equal(out.themeOverlap, 0)
})

test('normaliseConcepts keeps verified, counts dropped by reason', () => {
  const passage = 'The soul is restless until it rests in thee, says the bishop of Hippo.'
  const r = normaliseConcepts({ concepts: [
    { label: 'Restlessness', gloss: 'The heart unquiet apart from God.', evidence: 'restless until it rests in thee' },
    { label: 'Made up', gloss: 'x', evidence: 'a sentence that is nowhere in the passage' },
    { label: '', gloss: 'x', evidence: 'y' },
  ] }, passage)
  assert.equal(r.kept.length, 1)
  assert.deepEqual(r.dropped.map(d => d.reason), ['evidence-not-in-passage', 'incomplete'])
  assert.deepEqual(normaliseConcepts(null, passage), { kept: [], dropped: [] })
})

test('analyse: recurrence, theme overlap, near-duplicates', () => {
  const c = (label) => ({ label, gloss: 'g', evidence: 'e e e e' })
  const out = analyse([
    { slug: 't1', sections: [{ id: 's01', concepts: [c('Spiritual warfare'), c('Holy fear of God')] }] },
    { slug: 't2', sections: [{ id: 's01', concepts: [c('spiritual warfare'), c('Fear of God'), c('Tears of compunction')] }] },
  ], ['spiritual-warfare', 'prayer', 'rest', 'justice'])
  assert.equal(out.totalConcepts, 4)
  assert.equal(out.recurring, 1)
  assert.equal(out.themeOverlap, 1)
  assert.equal(out.novel, 3)
  assert.equal(out.concepts[0].key, 'spiritual warfare')
  assert.equal(out.concepts[0].themeOverlap, 'spiritual-warfare')
  assert.equal(out.duplicatePairs, 1)
})

const ex = (slug, ...labels) => ({ slug, sections: [{ id: 's01', concepts: labels.map(label => ({ label, gloss: 'g ' + label, evidence: 'e e e e e e' })) }] })

test('uniqueLabels: one row per key, stable order, ids are positions', () => {
  const rows = uniqueLabels([ex('t1', 'Tears of compunction', 'the two ways'), ex('t2', 'tears of compunction')])
  assert.deepEqual(rows.map(r => [r.id, r.key]), [[0, 'tear of compunction'], [1, 'the two ways']])
  assert.deepEqual(rows[0].texts, ['t1', 't2'])
})

test('grouping makes meaning, not wording, decide recurrence', () => {
  const data = [ex('t1', 'tears of compunction', 'the two ways'), ex('t2', 'weeping for sin', 'a lone idea')]
  assert.equal(analyse(data).recurring, 0)
  const labels = uniqueLabels(data)
  const id = l => labels.find(x => x.label === l).id
  const resolved = resolveGroups({ groups: [{ name: 'Compunction', ids: [id('tears of compunction'), id('weeping for sin')] }] }, labels)
  const out = analyse(data, [], { groupOf: groupOfFrom(resolved) })
  assert.equal(out.recurring, 1)
  assert.equal(out.recurringNovel, 1)
  assert.equal(out.concepts[0].key, 'compunction')
  assert.equal(out.concepts[0].labels.length, 2)
  assert.equal(out.largestGroup, 2)
  assert.equal(out.totalConcepts, 3) // the group plus the two ungrouped labels
})

test('resolveGroups rejects a bad grouping instead of half-applying it', () => {
  const labels = uniqueLabels([ex('t1', 'alpha idea', 'beta idea', 'gamma idea')])
  assert.throws(() => resolveGroups({}, labels), /must look like/)
  assert.throws(() => resolveGroups({ groups: [{ name: 'x', ids: [0, 9] }] }, labels), /not a label/)
  assert.throws(() => resolveGroups({ groups: [{ name: 'x', ids: [0, 1] }, { name: 'y', ids: [1, 2] }] }, labels), /in both/)
  assert.throws(() => resolveGroups({ groups: [{ name: '', ids: [0] }] }, labels), /no name/)
  assert.throws(() => resolveGroups({ groups: [{ name: 'x', ids: [0] }, { name: 'X', ids: [1] }] }, labels), /share a name/)
})
