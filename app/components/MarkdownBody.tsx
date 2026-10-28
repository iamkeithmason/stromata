import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { slugify } from '@/lib/headings'
import { rehypeScripture } from '@/lib/scripture/rehype-scripture'
import { isPlateParagraphMdast, plateFromHast } from '@/lib/markdown/plate'
import { remarkSmartPunctuation } from '@/lib/markdown/smart-punctuation'
import ScriptureRef from '@/app/components/ScriptureRef'

// Extracts plain text from a React node tree so we can slugify heading children.
// Must produce the same string that extractHeadings() produces from raw markdown.
function nodeToText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeToText).join('')
  if (node !== null && typeof node === 'object' && 'props' in node) {
    const el = node as { props: { children?: React.ReactNode } }
    return nodeToText(el.props.children)
  }
  return ''
}

// Minimal shape of the mdast nodes this plugin touches.
type MdastNode = {
  type: string
  value?: string
  children?: MdastNode[]
  data?: { hProperties?: Record<string, unknown> }
}

// Minimal shape of the hast nodes the component map inspects.
type HastNode = {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

// remark plugin: numbers only top-level paragraphs (direct children of the
// document root), tagging each with a data-pnum attribute that survives into
// the rendered HTML. Numbering off the real AST — the same tree react-markdown
// renders — keeps the display numbers in lockstep with what actually becomes a
// <p>. Paragraphs nested inside blockquotes or list items are not root
// children, so they're skipped; HTML comments/blocks and tables are not
// paragraph nodes, so they never consume a number.
function remarkNumberParagraphs() {
  return (tree: { children?: MdastNode[] }) => {
    let n = 0
    for (const node of tree.children ?? []) {
      if (node.type === 'paragraph') {
        // A plate carries no argument, so it takes no paragraph number.
        if (isPlateParagraphMdast(node)) continue
        n += 1
        const data = (node.data ??= {})
        const props = (data.hProperties ??= {})
        props['data-pnum'] = n
      }
    }
  }
}

export default function MarkdownBody({ content, numbered = true, size = 'default' }: { content: string; numbered?: boolean; size?: 'default' | 'large' | 'small' }) {
  const remarkPlugins = numbered
    ? [remarkGfm, remarkSmartPunctuation, remarkNumberParagraphs]
    : [remarkGfm, remarkSmartPunctuation]
  const proseSize = size === 'large' ? 'var(--text-xl)' : size === 'small' ? 'var(--text-label)' : 'var(--text-prose)'

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={[rehypeScripture]}
      components={{
        // Scripture references wrapped by rehypeScripture — rendered as the
        // inline hover/tap verse tooltip. Other spans pass through untouched.
        span: ({ node, children }) => {
          const props = node?.properties as { dataReference?: unknown; dataVerse?: unknown } | undefined
          if (props && typeof props.dataReference === 'string') {
            return (
              <ScriptureRef reference={props.dataReference} verse={String(props.dataVerse ?? '')}>
                {children}
              </ScriptureRef>
            )
          }
          return <span>{children}</span>
        },
        // Paragraphs — and plates, which arrive as a paragraph holding one image.
        p: ({ node, children }) => {
          const plate = plateFromHast((node as HastNode | undefined)?.children)
          if (plate) {
            const { src, alt } = plate
            return (
              <figure className="my-10 flex flex-col items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={alt}
                  loading="lazy"
                  className="h-auto"
                  style={{ maxWidth: 'min(100%, 26rem)', border: '1px solid var(--reader-quote-rule)' }}
                />
                {alt && (
                  <figcaption
                    className="mt-3 font-serif italic text-center"
                    style={{ color: 'var(--reader-quote)', fontSize: 'var(--text-sm)' }}
                  >
                    {alt}
                  </figcaption>
                )}
              </figure>
            )
          }
          const rawNum = node?.properties?.['data-pnum']
          const num = typeof rawNum === 'number'
            ? rawNum
            : typeof rawNum === 'string' && rawNum
              ? Number(rawNum)
              : undefined
          return (
            <div className="relative">
              {num !== undefined && (
                <span
                  className="absolute select-none pointer-events-none hidden sm:block"
                  style={{
                    left: '-2.5rem',
                    top: 0,
                    fontSize: 'var(--text-sm)',
                    color: 'var(--ink-mute)',
                    fontFamily: '"EB Garamond", Georgia, serif',
                    lineHeight: '2.5rem',
                  }}
                >
                  {num}
                </span>
              )}
              {/* Double leading suits the desktop measure; on a phone's ~38-character line it
                  spreads the text thin, so phones get 1.65 (about a fifth more text per screen). */}
              <p className={`font-serif mb-5 ${size === 'small' ? 'leading-relaxed' : 'leading-[1.65] sm:leading-loose'}`} style={{ color: 'var(--reader-text)', fontSize: proseSize }}>
                {children}
              </p>
            </div>
          )
        },
        // Headings — h2 and h3 get anchor IDs so the TOC sidebar can link to them.
        // The ID is generated by the same slugify() used in extractHeadings(),
        // ensuring TOC hrefs and heading IDs always match.
        h1: ({ children }) => (
          <h1 id={slugify(nodeToText(children))} className="font-serif text-2xl mt-10 mb-4" style={{ color: 'var(--reader-text)' }}>{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 id={slugify(nodeToText(children))} className="font-serif text-xl mt-8 mb-3" style={{ color: 'var(--reader-text)' }}>{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 id={slugify(nodeToText(children))} className="font-serif text-lg mt-6 mb-2" style={{ color: 'var(--reader-text)' }}>{children}</h3>
        ),
        // h4–h6 were unmapped, so they fell through to Tailwind preflight's sans stack and
        // read as a glitch (e.g. "Pliny to the Emperor Trajan"). Set them in serif small caps,
        // a quieter step below h3. Not in the TOC, so no anchor IDs.
        h4: ({ children }) => (
          <h4 className="smallcaps mt-6 mb-2" style={{ color: 'var(--reader-text)' }}>{children}</h4>
        ),
        h5: ({ children }) => (
          <h5 className="smallcaps mt-5 mb-2" style={{ color: 'var(--reader-text)' }}>{children}</h5>
        ),
        h6: ({ children }) => (
          <h6 className="smallcaps mt-5 mb-2" style={{ color: 'var(--reader-text)' }}>{children}</h6>
        ),
        // Blockquote — useful for scripture references
        blockquote: ({ children }) => (
          <blockquote
            className="border-l-2 pl-5 my-6 font-serif italic"
            style={{ borderColor: 'var(--reader-quote-rule)', color: 'var(--reader-quote)' }}
          >
            {children}
          </blockquote>
        ),
        // Bold and italic
        strong: ({ children }) => (
          <strong className="font-semibold" style={{ color: 'var(--reader-text)' }}>{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="list-disc pl-6 mb-5 space-y-1 font-serif" style={{ color: 'var(--reader-text)', fontSize: 'var(--text-prose)' }}>
            {children}
          </ul>
        ),
        // Preserve the list's starting number so a list that resumes after an
        // interrupting paragraph (e.g. "3." following prose) renders as 3, not 1.
        ol: ({ children, start }) => (
          <ol start={start} className="list-decimal pl-6 mb-5 space-y-1 font-serif" style={{ color: 'var(--reader-text)', fontSize: 'var(--text-prose)' }}>
            {children}
          </ol>
        ),
        // Horizontal rule — section break
        hr: () => (
          <hr className="my-10" style={{ borderColor: 'var(--reader-hr)' }} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
