'use client'
import { useState } from 'react'
import { SITE_URL } from '@/lib/metadata'

// "Cite this text" — builds a plain citation from metadata already on the page
// and copies it to the clipboard. MVP per the backlog card: a static footer
// button, no text-selection handling. Frontend only.
//
// Analytics: emits the distinct `citation-copy` event (from · text slug).
// Wire-verification on prod still owed before it counts as done.

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number | null>) => void }
  }
}

export function CitationButton({
  title,
  authorName,
  slug,
  sourceAttribution,
  accessionNumber,
  licenseName,
  licenseUrl,
}: {
  title: string
  authorName: string | null
  slug: string
  sourceAttribution: string | null
  accessionNumber: number | null
  licenseName?: string | null
  licenseUrl?: string | null
}) {
  const [copied, setCopied] = useState(false)

  const buildCitation = (): string => {
    const url = `${SITE_URL}/texts/${slug}`
    const accessed = new Date().toISOString().slice(0, 10)
    const parts = [
      authorName ? `${authorName}.` : null,
      `${title}.`,
      `The Stromata,`,
      `${url}`,
      `(accessed ${accessed}).`,
      accessionNumber != null ? `STROMATA № ${String(accessionNumber).padStart(2, '0')}.` : null,
      sourceAttribution ? `Source text: ${sourceAttribution}` : null,
      licenseName && licenseUrl ? `Licensed under ${licenseName} (${licenseUrl}).` : null,
    ].filter(Boolean)
    return parts.join(' ')
  }

  const onClick = async () => {
    const citation = buildCitation()
    let ok = false
    try {
      await navigator.clipboard.writeText(citation)
      ok = true
    } catch {
      // Clipboard API unavailable (older browser, insecure context) — fall back
      // to a hidden textarea + execCommand so the button still works.
      try {
        const ta = document.createElement('textarea')
        ta.value = citation
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }
    window.umami?.track('citation-copy', { from: 'text-reader', text: slug })
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:opacity-70 transition-opacity underline underline-offset-2 print:hidden"
      style={{ color: 'var(--ink-mute)', background: 'none', border: 'none', padding: '0.25rem 0', cursor: 'pointer', font: 'inherit' }}
    >
      {copied ? 'Citation copied ✓' : 'Cite this text'}
    </button>
  )
}
