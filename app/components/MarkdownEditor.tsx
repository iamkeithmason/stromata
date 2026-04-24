'use client'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Props = {
  name: string
  defaultValue?: string
  value?: string
  onChange?: (v: string) => void
  rows?: number
}

export default function MarkdownEditor({ name, defaultValue = '', value, onChange, rows = 24 }: Props) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [internal, setInternal] = useState(defaultValue)

  // Support both controlled (value+onChange) and uncontrolled (defaultValue) modes
  const content = value !== undefined ? value : internal
  const handleChange = (v: string) => {
    setInternal(v)
    onChange?.(v)
  }

  return (
    <div>
      {/* Tab bar */}
      <div
        className="flex gap-1 mb-2 border-b"
        style={{ borderColor: '#e5e0d8' }}
      >
        {(['write', 'preview'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="px-3 py-1.5 text-xs capitalize transition-colors"
            style={{
              color: tab === t ? '#1b1b1b' : '#6f6a60',
              borderBottom: tab === t ? '2px solid #1b1b1b' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto text-xs self-center pr-1" style={{ color: '#6f6a60' }}>
          Markdown supported
        </span>
      </div>

      {tab === 'write' ? (
        <textarea
          name={name}
          value={content}
          onChange={e => handleChange(e.target.value)}
          rows={rows}
          placeholder={`Enter the text body here. Markdown is supported:\n\n# Heading\n\nParagraph text...\n\n> Blockquote for scripture or citations\n\n**bold**, *italic*`}
          className="w-full border rounded px-3 py-2 font-mono text-sm leading-relaxed outline-none focus:ring-1"
          style={{
            borderColor: '#c8c3bb',
            background: '#fdfcf9',
            color: '#1b1b1b',
            resize: 'vertical',
          }}
        />
      ) : (
        <div
          className="border rounded px-5 py-4 min-h-[24rem] overflow-auto"
          style={{ borderColor: '#c8c3bb', background: '#fdfcf9' }}
        >
          {content.trim() ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => (
                  <p className="font-serif leading-loose mb-4 text-base" style={{ color: '#1b1b1b' }}>{children}</p>
                ),
                h1: ({ children }) => (
                  <h1 className="font-serif text-2xl mt-8 mb-3 font-normal" style={{ color: '#1b1b1b' }}>{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="font-serif text-xl mt-6 mb-2 font-normal" style={{ color: '#1b1b1b' }}>{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="font-serif text-lg mt-5 mb-2 font-normal" style={{ color: '#1b1b1b' }}>{children}</h3>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 pl-4 my-4 font-serif italic" style={{ borderColor: '#c8c3bb', color: '#6f6a60' }}>
                    {children}
                  </blockquote>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-5 mb-4 space-y-1 font-serif" style={{ color: '#1b1b1b' }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-5 mb-4 space-y-1 font-serif" style={{ color: '#1b1b1b' }}>{children}</ol>
                ),
                hr: () => <hr className="my-8" style={{ borderColor: '#e5e0d8' }} />,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              }}
            >
              {content}
            </ReactMarkdown>
          ) : (
            <p className="text-sm italic" style={{ color: '#6f6a60' }}>Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
