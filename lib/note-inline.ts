/**
 * The editor's featured note is typed in the admin form as light Markdown:
 * blank lines between paragraphs, `*title*` or `_title_` for italics and
 * `**word**` for bold. This turns that into plain data (paragraphs of runs)
 * so the homepage and the text page render it the same way without pulling a
 * full Markdown renderer into the hero. Anything else stays literal text.
 */
export type NoteRun = { text: string; em?: boolean; strong?: boolean }

const INLINE = /\*\*([^*\n]+?)\*\*|\*([^*\s][^*\n]*?)\*|(?<![\p{L}\p{N}])_([^_\s][^_\n]*?)_(?![\p{L}\p{N}])/gu

export function parseNoteRuns(line: string): NoteRun[] {
  const runs: NoteRun[] = []
  let last = 0
  for (const m of line.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) runs.push({ text: line.slice(last, at) })
    if (m[1] !== undefined) runs.push({ text: m[1], strong: true })
    else runs.push({ text: (m[2] ?? m[3]) as string, em: true })
    last = at + m[0].length
  }
  if (last < line.length) runs.push({ text: line.slice(last) })
  return runs
}

/** Paragraphs split on blank lines; single line breaks inside one become spaces. */
export function parseNote(note: string): NoteRun[][] {
  return note
    .trim()
    .split(/\n\s*\n/)
    .map(p => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map(parseNoteRuns)
}
