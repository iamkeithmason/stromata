'use client'

import { useState } from 'react'
import { parseNote } from '@/lib/note-inline'

/**
 * The editor's featured note as paragraphs, with its `*italics*` rendered.
 * Set upright at the reading size: a whole note in italic was hard to read
 * (Keith, 19 Nov 2026), so italic is kept for titles inside it, and the gold
 * rule and the attribution line mark it as the editor's.
 *
 * On phones only the first paragraph shows, with "Read more" for the rest
 * (Keith, 19 Nov 2026): at the reading size a three-paragraph note filled the
 * first screen, ahead of the text the reader came for. From `md` up the whole
 * note shows and the button is hidden. A client component for the toggle only;
 * it fetches nothing, so the page stays cached.
 */
export function EditorNote({
  note,
  style,
  linkColor = 'var(--gold-ink)',
}: {
  note: string
  style?: React.CSSProperties
  /** Colour of the "Read more" control: a token suited to the ground. */
  linkColor?: string
}) {
  const [open, setOpen] = useState(false)
  const paras = parseNote(note)
  const hasMore = paras.length > 1

  return (
    <>
      {paras.map((runs, i) => (
        <p
          key={i}
          className={i > 0 && !open ? 'hidden md:block' : undefined}
          style={{ ...style, margin: 0, marginTop: i > 0 ? '0.6em' : 0 }}
        >
          {runs.map((r, j) =>
            r.strong ? <strong key={j}>{r.text}</strong>
            : r.em ? <em key={j}>{r.text}</em>
            : <span key={j}>{r.text}</span>
          )}
        </p>
      ))}
      {hasMore && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="md:hidden kicker"
          style={{ color: linkColor, background: 'none', border: 0, padding: 0, minHeight: '44px', cursor: 'pointer' }}
        >
          Read more
        </button>
      )}
    </>
  )
}
