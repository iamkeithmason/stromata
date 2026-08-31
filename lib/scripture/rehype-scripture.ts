/**
 * rehype plugin: wrap scripture references in the rendered text with a marker
 * span carrying the reference label and its KJV verse text, for the reader to
 * turn into a tooltip.
 *
 * Runs server-side (inside MarkdownBody, a server component), so both the parser
 * and the ~4 MB KJV table stay off the client — only the handful of verses
 * actually present on the page cross the wire, inlined into the marker spans.
 *
 * Only references whose text resolves (single verses and same-chapter ranges in
 * the 66-book canon) are wrapped; whole-chapter and apocryphal references are
 * left as plain text, so a wrapped reference always has something to show.
 * Text inside headings, links, and code is skipped.
 */
import { parseReferences } from './parse'
import { resolveVerseText } from './verses'

interface HastText {
  type: 'text'
  value: string
}
interface HastElement {
  type: 'element'
  tagName: string
  properties?: Record<string, unknown>
  children: HastNode[]
}
type HastNode = HastText | HastElement | { type: string; children?: HastNode[] }

const SKIP_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre', 'a'])

function annotateTextNode(node: HastText): HastNode[] | null {
  const text = node.value
  const refs = parseReferences(text)
  if (refs.length === 0) return null

  const out: HastNode[] = []
  let cursor = 0
  let wrapped = false
  for (const ref of refs) {
    if (ref.index < cursor) continue // overlaps a reference already consumed
    const resolved = resolveVerseText(ref)
    if (!resolved) continue

    if (ref.index > cursor) out.push({ type: 'text', value: text.slice(cursor, ref.index) })
    out.push({
      type: 'element',
      tagName: 'span',
      properties: {
        className: ['scripture-ref'],
        dataReference: resolved.reference,
        dataVerse: resolved.text,
      },
      children: [{ type: 'text', value: text.slice(ref.index, ref.endIndex) }],
    })
    cursor = ref.endIndex
    wrapped = true
  }

  if (!wrapped) return null
  if (cursor < text.length) out.push({ type: 'text', value: text.slice(cursor) })
  return out
}

function walk(node: HastNode, skip: boolean): void {
  const children = (node as HastElement).children
  if (!children) return
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (child.type === 'text') {
      if (skip) continue
      const replacement = annotateTextNode(child as HastText)
      if (replacement) {
        children.splice(i, 1, ...replacement)
        i += replacement.length - 1
      }
    } else if (child.type === 'element') {
      const el = child as HastElement
      walk(el, skip || SKIP_TAGS.has(el.tagName))
    } else {
      walk(child, skip)
    }
  }
}

/** rehype plugin entry point. */
export function rehypeScripture() {
  return (tree: HastNode): void => walk(tree, false)
}
