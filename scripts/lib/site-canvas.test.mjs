import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateCanvas, buildGraph } from './site-canvas.mjs'

const known = new Set(['author-page', 'read-next', 'featured-band', 'theme-page'])
const isSurface = v => known.has(v)

const pages = [
  {
    name: 'Home', route: '/', canvas: { col: 0, row: 0 },
    links: [{ to: 'Author page', event: 'author-open', from: ['featured-band'] }],
  },
  {
    name: 'Author page', route: '/authors/x', canvas: { col: 1, row: 0 },
    links: [{ to: 'Reader', event: 'text-open', from: ['author-page'] }],
  },
  {
    name: 'Reader', route: '/texts/x', canvas: { col: 2, row: 0, label: 'A text' },
    links: [{ to: 'Reader', event: 'text-open', from: ['read-next'] }],
  },
  { name: 'Not found (404)', route: '/nope' },
]

test('a well-formed manifest validates clean', () => {
  assert.deepEqual(validateCanvas(pages, isSurface), [])
})

test('validation names each problem', () => {
  const bad = [
    { name: 'A', canvas: { col: 0, row: 0 }, links: [
      { to: 'Nowhere', event: 'text-open', from: ['read-nxt'] },
      { to: 'B', event: 'text-open', from: [] },
    ] },
    { name: 'B', canvas: { col: 0, row: 0 }, links: [{ to: 'A', event: 'text-open', from: ['author-page'] }] },
    { name: 'C', canvas: { col: 1, row: 0 }, links: [{ to: 'A', event: 'text-open', from: ['author-page'] }] },
    { name: 'D', links: [{ to: 'A', event: 'x', from: ['author-page'] }] },
  ]
  const errors = validateCanvas(bad, isSurface).join('\n')
  assert.match(errors, /"Nowhere" is not a page on the canvas/)
  assert.match(errors, /"read-nxt" is not a recorded `from` value/)
  assert.match(errors, /needs at least one `from` value/)
  assert.match(errors, /B: shares canvas cell 0,0 with A/)
  assert.match(errors, /text-open · author-page is already counted by B link 1/)
  assert.match(errors, /D: has links but no canvas position/)
})

test('edges carry per-surface counts, and uncovered clicks are reported, not lost', () => {
  const clicks = {
    range: '30d',
    events: {
      'text-open': { total: 120, byFrom: { 'author-page': 40, 'read-next': 3, 'theme-page': 4, 'mystery-surface': 2 } },
      'author-open': { total: 12, byFrom: { 'featured-band': 12 } },
    },
  }
  const g = buildGraph(pages, clicks, isSurface)
  assert.equal(g.nodes.length, 3, 'pages without a canvas position stay off')
  assert.equal(g.nodes.find(n => n.id === 'reader').label, 'A text')

  const byId = Object.fromEntries(g.edges.map(e => [e.id, e]))
  assert.equal(byId['author-page--text-open--reader'].count, 40)
  assert.equal(byId['home--author-open--author-page'].count, 12)
  const loop = byId['reader--text-open--reader']
  assert.equal(loop.source, loop.target)
  assert.equal(loop.count, 3)

  assert.deepEqual(g.offCanvas, [{ event: 'text-open', from: 'theme-page', count: 4 }])
  assert.deepEqual(g.unknown, [{ event: 'text-open', from: 'mystery-surface', count: 2 }])
  assert.deepEqual(g.coverage.find(c => c.event === 'text-open'), { event: 'text-open', attributed: 49, total: 120 })
})

test('a linked surface with no clicks counts 0; a missing event counts null, never 0', () => {
  const g = buildGraph(pages, { range: '7d', events: { 'text-open': { total: 1, byFrom: { 'author-page': 1 } } } }, isSurface)
  const byId = Object.fromEntries(g.edges.map(e => [e.id, e]))
  assert.equal(byId['reader--text-open--reader'].count, 0)
  assert.equal(byId['home--author-open--author-page'].count, null)
})

test('with no click data at all, every edge is null and nothing is reported missing', () => {
  const g = buildGraph(pages, null, isSurface)
  assert.equal(g.hasClicks, false)
  assert.ok(g.edges.every(e => e.count === null && e.parts.every(p => p.count === null)))
  assert.deepEqual(g.offCanvas, [])
  assert.deepEqual(g.coverage, [])
})
