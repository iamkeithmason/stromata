/**
 * Editorial sections on the rendered page: find where each one starts, and
 * give that paragraph an id the reading header's contents can jump to.
 *
 * A section (migration 034, scripts/lib/sections.mjs) stores the opening words
 * of the paragraph it starts at, not a number. The ADMIN review page resolves
 * those words with `resolveAnchor` over `bodyBlocks`; this module calls the
 * very same two functions, so the reader and the reviewer can never disagree
 * about which paragraph a section starts at. An anchor that no longer finds
 * exactly one paragraph (the body was edited after approval) is dropped, not
 * guessed: the reviewer is already told about it there.
 *
 * Blocks are found in the raw markdown; the rendered element is then found by
 * SOURCE POSITION. remark keeps each node's offset into the original string,
 * so the plugin tags the first block-level node (a top-level paragraph,
 * heading or quote, or a list item: Chrysostom's addresses are numbered lists)
 * that starts at or after the block's offset. No text matching happens on the
 * rendered side, so smart quotes and scripture links cannot throw it off.
 */

import { bodyBlocks, resolveAnchor } from '@/scripts/lib/sections.mjs'
import { sectionId } from '@/lib/reader/outline'

export type LocatedSection = { id: string; label: string; offset: number }

/** Start offsets of the body's blocks, in the same order and by the same split as `bodyBlocks`. */
export function blockOffsets(body: string): number[] {
  const offsets: number[] = []
  const re = /\n[ \t]*\n/g
  let start = 0
  const push = (from: number, to: number) => {
    const chunk = body.slice(from, to)
    const lead = chunk.length - chunk.trimStart().length
    if (chunk.trim()) offsets.push(from + lead)
  }
  for (let m = re.exec(body); m; m = re.exec(body)) {
    push(start, m.index)
    start = m.index + m[0].length
  }
  push(start, body.length)
  return offsets
}

/**
 * The sections whose anchors still find their paragraph, in body order, each
 * with the id its paragraph will carry and the paragraph's offset in `body`.
 * Ids are numbered by position in the result, so they run section-1…section-n
 * with no gap even when an anchor dropped out.
 */
export function locateSections(body: string, sections: { label: string; anchor: string }[]): LocatedSection[] {
  if (!sections.length) return []
  const blocks: string[] = bodyBlocks(body)
  const offsets = blockOffsets(body)
  if (offsets.length !== blocks.length) return [] // the two splits disagree: show no sections rather than wrong ones
  const found: { label: string; offset: number }[] = []
  let last = -1
  for (const s of sections) {
    const i: number = resolveAnchor(blocks, s.anchor)
    if (i <= last) continue // missing, or out of order
    found.push({ label: s.label, offset: offsets[i] })
    last = i
  }
  return found.map((f, k) => ({ ...f, id: sectionId(k + 1) }))
}

type Node = {
  type: string
  children?: Node[]
  position?: { start?: { offset?: number } }
  data?: { hProperties?: Record<string, unknown> }
}

/** The nodes a section can start at, in document order. */
function candidates(tree: Node): Node[] {
  const out: Node[] = []
  for (const node of tree.children ?? []) {
    if (node.type === 'list') out.push(...(node.children ?? []))
    else out.push(node)
  }
  return out
}

/**
 * remark plugin: tag the node each located section starts at with its id.
 * Takes `LocatedSection[]` from `locateSections` over the same body.
 */
export function remarkSectionAnchors(located: LocatedSection[]) {
  return (tree: Node) => {
    if (!located.length) return
    const nodes = candidates(tree)
    let from = 0
    for (const s of located) {
      for (let j = from; j < nodes.length; j++) {
        const at = nodes[j].position?.start?.offset
        if (typeof at === 'number' && at >= s.offset) {
          const data = (nodes[j].data ??= {})
          const props = (data.hProperties ??= {})
          props.id = s.id
          props['data-section'] = 'editorial'
          from = j + 1
          break
        }
      }
    }
  }
}
