/**
 * Tests for placing editorial sections on the rendered reader page. The
 * property that matters: the paragraph a section starts at on the PAGE is the
 * one the review page resolved (same `resolveAnchor`), including when the body
 * is a numbered list, as Chrysostom's addresses are.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import * as React from 'react'
import { bodyBlocks } from '@/scripts/lib/sections.mjs'
import { blockOffsets, locateSections } from './section-anchors'

// tsx compiles the component's JSX with the classic runtime, which expects a
// global React; Next uses the automatic runtime and needs none.
;(globalThis as { React?: typeof React }).React = React
async function render(props: { content: string; sections?: ReturnType<typeof locateSections> }) {
  const { default: MarkdownBody } = await import('@/app/components/MarkdownBody')
  return renderToStaticMarkup(React.createElement(MarkdownBody, props))
}

const prose = [
  'Has any man done what I asked? Let us begin.',
  '"The man-child has lately been born," said he -- and so on.',
  'Regard thyself as a king of a city, with walls.',
  'Well now, let us first of all approach the gate of the tongue.',
].join('\n\n')

const list = [
  '1. Has any man done what I asked? Let us begin.',
  '2. Something else entirely that is in between.',
  '3. Regard thyself as a king of a city, with walls.',
].join('\n\n')

test('blockOffsets splits exactly as bodyBlocks does', () => {
  for (const body of [prose, list, '\n\n  lead\n\n\n\ntrail  \n']) {
    const blocks: string[] = bodyBlocks(body)
    const offsets = blockOffsets(body)
    assert.equal(offsets.length, blocks.length)
    offsets.forEach((o, i) => assert.ok(body.slice(o).startsWith(blocks[i])))
  }
})

test('sections are located in order, with contiguous ids, and a stale anchor drops out', () => {
  const located = locateSections(prose, [
    { label: 'Vainglory', anchor: 'Has any man done what I asked' },
    { label: 'Gone', anchor: 'This sentence is not in the body at all' },
    { label: 'The soul as a city', anchor: 'Regard thyself as a king' },
  ])
  assert.deepEqual(located.map(l => [l.id, l.label]), [['section-1', 'Vainglory'], ['section-2', 'The soul as a city']])
})

test('an anchor that would go backwards is dropped rather than reordering the text', () => {
  const located = locateSections(prose, [
    { label: 'Later', anchor: 'Regard thyself as a king' },
    { label: 'Earlier', anchor: 'Has any man done what I asked' },
  ])
  assert.deepEqual(located.map(l => l.label), ['Later'])
})

test('the rendered paragraph carries the id, despite smart quotes and dashes', async () => {
  const located = locateSections(prose, [
    { label: 'One', anchor: 'Has any man done what I asked' },
    { label: 'Two', anchor: '"The man-child has lately been born," said he' },
  ])
  const html = await render({ content: prose, sections: located })
  assert.match(html, /id="section-1"[^>]*>[\s\S]*?Has any man/)
  assert.match(html, /id="section-2"[^>]*>[\s\S]*?man-child/)
  assert.equal((html.match(/data-section="editorial"/g) ?? []).length, 2)
})

test('in a numbered list, the list item carries the id', async () => {
  const located = locateSections(list, [
    { label: 'One', anchor: 'Has any man done what I asked' },
    { label: 'Three', anchor: 'Regard thyself as a king' },
  ])
  const html = await render({ content: list, sections: located })
  assert.match(html, /<li[^>]*id="section-1"[\s\S]*?Has any man/)
  assert.match(html, /<li[^>]*id="section-2"[\s\S]*?Regard thyself/)
})

test('no sections, no ids', async () => {
  const html = await render({ content: prose })
  assert.doesNotMatch(html, /section-1/)
})
