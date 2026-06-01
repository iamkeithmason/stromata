export type Heading = { level: 1 | 2 | 3; text: string; id: string }

/**
 * Converts heading text to a URL-safe anchor ID.
 * Used identically by:
 *   - extractHeadings()  — server-side, parsing raw markdown strings
 *   - MarkdownBody.tsx   — client-side, extracting text from React nodes
 * Both sides must produce the same output for anchor links to work.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')  // strip non-alphanumeric except spaces and hyphens
    .replace(/\s+/g, '-')      // spaces → hyphens
    .replace(/-+/g, '-')       // collapse consecutive hyphens
    .replace(/^-|-$/g, '')     // trim leading/trailing hyphens
}

/**
 * Strips inline markdown syntax from a heading line so the resulting
 * plain text matches what React renders as heading children.
 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\\([\\`*_{}\[\]()#+\-.!|])/g, '$1') // backslash escapes e.g. \. → .
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/\*([^*]+)\*/g, '$1')     // *italic*
    .replace(/__([^_]+)__/g, '$1')     // __bold__
    .replace(/_([^_]+)_/g, '$1')       // _italic_
    .replace(/`([^`]+)`/g, '$1')       // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url)
    .trim()
}

/**
 * Parses raw markdown body text and returns h2/h3 headings with IDs.
 * Only includes h2 and h3 — h1 is rarely used in body text.
 * TODO: if OCR-sourced texts produce noisy heading structure, add a
 *       min-word-count filter here before surfacing in the TOC.
 */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []
  for (const line of markdown.split('\n')) {
    const match = line.match(/^(#{1,3})\s+(.+)$/)
    if (!match) continue
    const level = match[1].length as 1 | 2 | 3
    const text = stripInlineMarkdown(match[2])
    if (!text) continue
    headings.push({ level, text, id: slugify(text) })
  }
  return headings
}
