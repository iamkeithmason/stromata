'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMemo } from 'react'

// Builds a map from 1-based start line → paragraph display number.
// Paragraphs are non-empty blocks that aren't headings, hr, fenced code, blockquotes, or lists.
function buildParagraphLineMap(content: string): Map<number, number> {
  const map = new Map<number, number>()
  const lines = content.split('\n')
  let pNum = 0
  let i = 0
  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) i++
    if (i >= lines.length) break
    const blockStart = i + 1 // remark uses 1-based line numbers
    const first = lines[i].trim()
    const isHeading = /^#{1,6}\s/.test(first)
    const isHr = /^[-*_]{3,}$/.test(first)
    const isCode = first.startsWith('```')
    const isBlockquote = first.startsWith('>')
    const isList = /^[-*+]\s|^\d+\.\s/.test(first)
    while (i < lines.length && lines[i].trim()) i++
    if (!isHeading && !isHr && !isCode && !isBlockquote && !isList) {
      map.set(blockStart, ++pNum)
    }
  }
  return map
}

export default function MarkdownBody({ content }: { content: string }) {
  const paragraphLineMap = useMemo(() => buildParagraphLineMap(content), [content])

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Paragraphs
        p: ({ node, children }) => {
          const num = node?.position?.start?.line
            ? paragraphLineMap.get(node.position.start.line)
            : undefined
          return (
            <div className="relative">
              {num !== undefined && (
                <span
                  className="absolute select-none pointer-events-none hidden sm:block"
                  style={{
                    left: '-2.5rem',
                    top: 0,
                    fontSize: '0.65rem',
                    color: 'var(--ink-mute)',
                    fontFamily: '"EB Garamond", Georgia, serif',
                    lineHeight: '2.5rem',
                  }}
                >
                  {num}
                </span>
              )}
              <p className="font-serif leading-loose mb-5 text-[1.25rem]" style={{ color: '#1b1b1b' }}>
                {children}
              </p>
            </div>
          )
        },
        // Headings
        h1: ({ children }) => (
          <h1 className="font-serif text-2xl mt-10 mb-4" style={{ color: '#1b1b1b' }}>{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="font-serif text-xl mt-8 mb-3" style={{ color: '#1b1b1b' }}>{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="font-serif text-lg mt-6 mb-2" style={{ color: '#1b1b1b' }}>{children}</h3>
        ),
        // Blockquote — useful for scripture references
        blockquote: ({ children }) => (
          <blockquote
            className="border-l-2 pl-5 my-6 font-serif italic"
            style={{ borderColor: '#c8c3bb', color: '#6f6a60' }}
          >
            {children}
          </blockquote>
        ),
        // Bold and italic
        strong: ({ children }) => (
          <strong className="font-semibold" style={{ color: '#1b1b1b' }}>{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="list-disc pl-6 mb-5 space-y-1 font-serif text-[1.25rem]" style={{ color: '#1b1b1b' }}>
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-6 mb-5 space-y-1 font-serif text-[1.25rem]" style={{ color: '#1b1b1b' }}>
            {children}
          </ol>
        ),
        // Horizontal rule — section break
        hr: () => (
          <hr className="my-10" style={{ borderColor: '#e5e0d8' }} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
