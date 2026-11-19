import { parseNote } from '@/lib/note-inline'

/**
 * The editor's featured note as paragraphs, with its `*italics*` rendered.
 * Set upright at the reading size: a whole note in italic was hard to read
 * (Keith, 19 Nov 2026), so italic is kept for titles inside it, and the gold
 * rule and the attribution line mark it as the editor's.
 */
export function EditorNote({ note, style }: { note: string; style?: React.CSSProperties }) {
  const paras = parseNote(note)
  return (
    <>
      {paras.map((runs, i) => (
        <p key={i} style={{ ...style, margin: 0, marginTop: i > 0 ? '0.6em' : 0 }}>
          {runs.map((r, j) =>
            r.strong ? <strong key={j}>{r.text}</strong>
            : r.em ? <em key={j}>{r.text}</em>
            : <span key={j}>{r.text}</span>
          )}
        </p>
      ))}
    </>
  )
}
