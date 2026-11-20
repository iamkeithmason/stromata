import test from 'node:test'
import assert from 'node:assert/strict'
import { placeProspect, groupByLane, heldReason, LANES } from './lanes'

test('a digital pending prospect waits for the copyright check, with its death year', () => {
  assert.deepEqual(placeProspect({ status: 'pending', source_type: 'newadvent', death_year: 407 }), {
    lane: 'copyright', reason: 'Author d. 407',
  })
  assert.equal(placeProspect({ status: 'pending', source_type: 'ccel' }).reason, 'Author death year not recorded yet')
  assert.match(placeProspect({ status: 'pending', source_type: 'ccel', death_year: 1923 }).reason, /fails the pre-1900 rule/)
})

test('scanned sources go to the OCR lane however far along they are, until output exists', () => {
  assert.equal(placeProspect({ status: 'pending', source_type: 'archive_ocr' }).lane, 'ocr')
  assert.equal(placeProspect({ status: 'stage-1-done', source_type: 'archive_ocr' }).lane, 'ocr')
  assert.equal(placeProspect({ status: 'stage-2-done', source_type: 'archive_ocr', _hasOutput: false }).lane, 'ocr')
  assert.equal(placeProspect({ status: 'stage-2-done', source_type: 'archive_ocr', _hasOutput: true }).lane, 'review')
})

test('the middle of the chain: cleared → fetch, fetched with output → review, staged → import', () => {
  assert.equal(placeProspect({ status: 'stage-1-done', source_type: 'gutenberg' }).lane, 'fetch')
  assert.equal(placeProspect({ status: 'stage-2-done', source_type: 'gutenberg', _hasOutput: true }).lane, 'review')
  assert.equal(placeProspect({ status: 'stage-3-done', source_type: 'gutenberg', _hasOutput: true }).lane, 'review')
  assert.equal(placeProspect({ status: 'stage-2-done', source_type: 'gutenberg', _hasOutput: false }).lane, 'fetch')
  assert.equal(placeProspect({ status: 'staged' }).lane, 'import')
})

test('imported prospects split on whether their texts are live', () => {
  assert.equal(placeProspect({ status: 'imported', _liveStatus: 'live' }).lane, 'published')
  assert.equal(placeProspect({ status: 'imported', _liveStatus: 'draft' }).lane, 'drafts')
  const unknown = placeProspect({ status: 'imported', _liveStatus: 'unknown' })
  assert.equal(unknown.lane, 'drafts')
  assert.match(unknown.reason, /could not be matched/)
})

test('rejected carries its reason, shortened to one sentence', () => {
  const r = placeProspect({ status: 'rejected', rejection_reason: 'Translator Archibald Robertson d. 1931, after the cutoff. Hold for a ruling.' })
  assert.deepEqual(r, { lane: 'rejected', reason: 'Translator Archibald Robertson d. 1931, after the cutoff.' })
})

test('a held prospect says why it is held instead of the lane default', () => {
  const notes =
    'Synced 2026-09-11. [2026-11-20 cloud run] HELD at Stage 1: source_url is a Wikisource versions page (196 words), not the text. Needs a specific edition URL pinned.'
  assert.equal(heldReason(notes), 'Held: source_url is a Wikisource versions page (196 words), not the text.')
  assert.equal(placeProspect({ status: 'pending', source_type: 'wikisource', stage_1_notes: notes }).reason, heldReason(notes))
  assert.equal(heldReason('Nothing unusual here.'), null)
})

test('groupByLane keeps every lane, empty ones too, in chain order', () => {
  const g = groupByLane([
    { status: 'pending', source_type: 'newadvent', death_year: 400 },
    { status: 'imported', _liveStatus: 'live' as const },
  ])
  assert.deepEqual([...g.keys()], LANES.map(l => l.id))
  assert.equal(g.get('copyright')!.length, 1)
  assert.equal(g.get('published')!.length, 1)
  assert.equal(g.get('ocr')!.length, 0)
})
