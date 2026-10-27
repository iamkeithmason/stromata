// Typographic punctuation, applied when a text is rendered rather than written
// back to the database: straight quotes become curly, and a double hyphen
// becomes an em dash. Many sources (Gutenberg plain text, OCR, hand-keyed
// translations) reach the corpus with typewriter punctuation — Pliny's letters
// read "cursed Christ--none" and 'as to a god' — and fixing it at render keeps
// the stored body exactly as imported, costs no bulk job (see the Supabase
// limits section of CLAUDE.md), and applies to every text at once.
//
// Only prose text nodes are touched; code and inline code are separate mdast
// node types and never reach here.

// Characters after which a quote opens rather than closes.
const OPENS_AFTER = /[\s([{—–\-/“‘]/

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch)
}

/**
 * Smarten one run of text. `prev` is the character that came immediately
 * before it in the document (across inline formatting), so that a quote at
 * the start of a node after *emphasis* still closes correctly.
 */
export function smartenText(text: string, prev = ''): string {
  // A run of exactly two hyphens is an em dash; three or more are left alone.
  const dashed = text.replace(/(?<!-)--(?!-)/g, '—')
  let out = ''
  let before = prev
  for (let i = 0; i < dashed.length; i++) {
    const ch = dashed[i]
    const next = dashed[i + 1]
    if (ch === '"') {
      out += before === '' || OPENS_AFTER.test(before) ? '“' : '”'
    } else if (ch === "'") {
      if (isWordChar(before) && isWordChar(next)) out += '’' // don't, Peter's
      else if (before === '' || OPENS_AFTER.test(before)) out += '‘'
      else out += '’'
    } else {
      out += ch
    }
    before = ch
  }
  return out
}

type TextNode = { type: string; value?: string; children?: TextNode[] }

/** remark plugin: smarten every text node, in document order. */
export function remarkSmartPunctuation() {
  return (tree: TextNode) => {
    let prev = ''
    const walk = (node: TextNode) => {
      // A new block starts a new run: a quote opening a paragraph opens.
      if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'tableCell') prev = ''
      if (node.type === 'text' && typeof node.value === 'string') {
        node.value = smartenText(node.value, prev)
        prev = node.value.slice(-1)
        return
      }
      if (node.type === 'inlineCode' || node.type === 'code') {
        prev = 'x' // treat code as a word, so a quote right after it closes
        return
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}
