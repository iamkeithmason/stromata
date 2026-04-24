'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function MarkdownBody({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Paragraphs
        p: ({ children }) => (
          <p className="font-serif leading-loose mb-5 text-[1.05rem]" style={{ color: '#1b1b1b' }}>
            {children}
          </p>
        ),
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
          <ul className="list-disc pl-6 mb-5 space-y-1 font-serif text-[1.05rem]" style={{ color: '#1b1b1b' }}>
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-6 mb-5 space-y-1 font-serif text-[1.05rem]" style={{ color: '#1b1b1b' }}>
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
