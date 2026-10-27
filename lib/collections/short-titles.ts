/**
 * Row titles for a collection's contents list.
 *
 * Many collections title every part with the work's name first ("The Refutation of
 * All Heresies, Book I", "The Shepherd of Hermas (Book II)"). On the collection page
 * the work's name is already the heading, so repeating it on every row only pushes the
 * part that differs ("Book IV") onto a second line on a phone. This drops the leading
 * phrase that every row shares, but only when it ends at a clear separator, so a
 * shared word such as "Tractate 1 …", "Tractate 2 …" is left alone.
 *
 * Display only: links, analytics and structured data keep the full title.
 */

// A separator the shared head may end on. " (" is handled separately because it
// leaves a closing bracket on the end of each remainder.
const SEPARATORS = [', ', ': ', '. ', ' — ', ' – ', ' - ', ' (']

const MIN_HEAD = 4

function commonPrefix(titles: string[]): string {
  let prefix = titles[0]
  for (const t of titles.slice(1)) {
    let i = 0
    while (i < prefix.length && i < t.length && prefix[i] === t[i]) i++
    prefix = prefix.slice(0, i)
    if (!prefix) break
  }
  return prefix
}

export function shortCollectionTitles(titles: string[]): string[] {
  if (titles.length < 2) return titles

  const prefix = commonPrefix(titles)
  let cut = -1
  let sep = ''
  for (const s of SEPARATORS) {
    const at = prefix.lastIndexOf(s)
    if (at >= 0 && at + s.length > cut) {
      cut = at + s.length
      sep = s
    }
  }
  if (cut < 0 || cut - sep.length < MIN_HEAD) return titles

  const rest = titles.map(t => {
    let r = t.slice(cut).trim()
    // "The Shepherd of Hermas (Book I)" → "Book I)" → "Book I"
    if (sep === ' (' && r.endsWith(')') && !r.slice(0, -1).includes('(')) r = r.slice(0, -1).trim()
    // "On the Priesthood. Book I." → "Book I." → "Book I"
    if (/^[^.]+\.$/.test(r)) r = r.slice(0, -1)
    return r
  })

  // Every row must keep something that reads as a title of its own.
  if (rest.some(r => !/^[\p{L}\p{N}]/u.test(r))) return titles
  return rest
}
