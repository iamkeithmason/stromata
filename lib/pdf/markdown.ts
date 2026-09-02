// Minimal markdown → block model for PDF rendering. `texts.body` is markdown,
// but @react-pdf can't consume markdown or HTML — it needs primitives. This
// parser covers the block and inline shapes that actually occur in the corpus
// (headings, paragraphs, blockquotes, rules, simple lists; bold/italic/links),
// and degrades gracefully on anything else by treating it as plain text.
//
// Deliberately not a full CommonMark implementation — no tables, nested lists,
// or reference links. Underscores are left literal (they appear inside words
// far more often than they mean emphasis in this corpus); only `*` emphasis and
// `[text](url)` links are interpreted.

export type Run = { text: string; bold?: boolean; italic?: boolean }

export type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'p' | 'blockquote' | 'li'; runs: Run[] }
  | { type: 'hr' }

// Inline: strip images, unwrap links/code, then toggle emphasis on * markers.
export function parseInline(raw: string): Run[] {
  const s = raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images → gone
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → link text
    .replace(/`([^`]+)`/g, '$1') // inline code → text
    .trim()

  const runs: Run[] = []
  let bold = false
  let italic = false
  // Split into emphasis markers and the text between them.
  const tokens = s.match(/(\*\*\*|\*\*|\*|[^*]+)/g) ?? []
  for (const tok of tokens) {
    if (tok === '***') {
      bold = !bold
      italic = !italic
    } else if (tok === '**') {
      bold = !bold
    } else if (tok === '*') {
      italic = !italic
    } else if (tok.length > 0) {
      runs.push({ text: tok, bold: bold || undefined, italic: italic || undefined })
    }
  }
  return runs.length > 0 ? runs : [{ text: s }]
}

export function parseMarkdownBlocks(md: string): Block[] {
  const blocks: Block[] = []
  const lines = md.replace(/\r\n/g, '\n').split('\n')

  let para: string[] = []
  let quote: string[] = []

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'p', runs: parseInline(para.join(' ')) })
      para = []
    }
  }
  const flushQuote = () => {
    if (quote.length) {
      blocks.push({ type: 'blockquote', runs: parseInline(quote.join(' ')) })
      quote = []
    }
  }

  for (const line of lines) {
    const t = line.trim()

    if (t === '') {
      flushPara()
      flushQuote()
      continue
    }

    // Horizontal rule
    if (/^([-*_])\1{2,}$/.test(t)) {
      flushPara()
      flushQuote()
      blocks.push({ type: 'hr' })
      continue
    }

    // Headings
    const h = /^(#{1,6})\s+(.*)$/.exec(t)
    if (h) {
      flushPara()
      flushQuote()
      const level = h[1].length
      const type = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3'
      blocks.push({ type, runs: parseInline(h[2]) })
      continue
    }

    // Blockquote
    if (t.startsWith('>')) {
      flushPara()
      quote.push(t.replace(/^>\s?/, ''))
      continue
    }

    // List item (unordered or ordered) → flat bullet
    const li = /^([-*+]|\d+[.)])\s+(.*)$/.exec(t)
    if (li) {
      flushPara()
      flushQuote()
      blocks.push({ type: 'li', runs: parseInline(li[2]) })
      continue
    }

    // Otherwise accumulate into the current paragraph
    flushQuote()
    para.push(t)
  }

  flushPara()
  flushQuote()
  return blocks
}
