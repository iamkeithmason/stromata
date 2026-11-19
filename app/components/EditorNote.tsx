import { parseNote } from '@/lib/note-inline'

/**
 * The editor's featured note as paragraphs, with its `*italics*` rendered.
 * The note is set in italic, so an italicised title inside it turns roman,
 * the usual typographic convention for a title within italic text.
 */
export function EditorNote({ note, style }: { note: string; style?: React.CSSProperties }) {
  const paras = parseNote(note)
  return (
    <>
      {paras.map((runs, i) => (
        <p key={i} style={{ ...style, margin: 0, marginTop: i > 0 ? '0.6em' : 0 }}>
          {runs.map((r, j) =>
            r.strong ? <strong key={j}>{r.text}</strong>
            : r.em ? <em key={j} style={{ fontStyle: 'normal' }}>{r.text}</em>
            : <span key={j}>{r.text}</span>
          )}
        </p>
      ))}
    </>
  )
}
