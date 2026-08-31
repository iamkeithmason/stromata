'use client'
import { useState, useId, useCallback } from 'react'

/**
 * An inline scripture reference in the reader. Shows the KJV verse text in a
 * small popover on hover / keyboard focus (desktop) or tap (touch). The verse
 * text is resolved server-side and passed in as a prop — this component never
 * touches the KJV data or the parser.
 */
export default function ScriptureRef({
  reference,
  verse,
  children,
}: {
  reference: string
  verse: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const close = useCallback(() => setOpen(false), [])

  return (
    <span
      className="scripture-anchor"
      tabIndex={0}
      role="button"
      aria-expanded={open}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={close}
      onFocus={() => setOpen(true)}
      onBlur={close}
      onClick={e => {
        e.preventDefault()
        setOpen(o => !o)
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          close()
          ;(e.currentTarget as HTMLElement).blur()
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setOpen(o => !o)
        }
      }}
    >
      <span className="scripture-ref">{children}</span>
      {open && (
        <span className="scripture-popover" role="tooltip" id={id}>
          <span className="scripture-popover-ref">{reference}</span>
          <span className="scripture-popover-text">{verse}</span>
          <a
            href={`/scripture/${encodeURIComponent(reference)}`}
            className="scripture-popover-link"
            data-umami-event="scripture-lookup"
            data-umami-event-from="text-reader"
          >
            Cited elsewhere →
          </a>
        </span>
      )}
    </span>
  )
}
