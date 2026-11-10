'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { MIN_PIECE_WORDS, TARGET_MAX_WORDS } from '@/scripts/lib/paragraphs.mjs'

/** One long paragraph: its sentences, their word counts, and the sentences a break follows. */
export type Wall = { index: number; sentences: string[]; words: number[]; breaks: number[] }

type Props = {
  id: string
  title: string
  slug: string
  author: string | null
  published: boolean
  walls: Wall[]
  /** Proposed breaks that no longer find their place in the body. */
  missing: number
  /** Proposed breaks that are already in the body (added by hand since). */
  alreadyBroken: number
  /** Why a held, empty proposal has no breaks, when the drafting step said. */
  note: string | null
  /** The text's updated_at when this page loaded; the server refuses a stale page. */
  loadedAt: string
  state: 'pending' | 'held' | 'applied'
  nextSlug: string | null
}

const TAIL_WORDS = 14
const HEAD_WORDS = 14
const tail = (s: string) => {
  const w = s.split(/\s+/)
  return w.length > TAIL_WORDS ? `… ${w.slice(-TAIL_WORDS).join(' ')}` : s
}
const head = (s: string) => {
  const w = s.split(/\s+/)
  return w.length > HEAD_WORDS ? `${w.slice(0, HEAD_WORDS).join(' ')} …` : s
}

/** Word counts of the pieces a paragraph becomes with breaks after `breaks`. */
function pieces(words: number[], breaks: number[]): number[] {
  const out: number[] = []
  let from = 0
  for (const cut of [...breaks, words.length - 1]) {
    out.push(words.slice(from, cut + 1).reduce((a, b) => a + b, 0))
    from = cut + 1
  }
  return out
}

/** How many sentences piece `p` of a paragraph holds. */
function sentenceCount(w: Wall, p: number): number {
  const from = p === 0 ? 0 : w.breaks[p - 1] + 1
  const to = p === w.breaks.length ? w.sentences.length - 1 : w.breaks[p]
  return to - from + 1
}

/**
 * One text's proposed paragraph breaks, reviewed on a phone. Each break shows
 * the end of the sentence before it and the start of the one after: move it a
 * sentence either way, remove it, or add one inside a long piece. Breaks are
 * held as sentence numbers here; the server turns them into anchors and, on
 * Approve, inserts them into the body only if every word is unchanged.
 */
export default function ParagraphsEditor(props: Props) {
  const { id, title, slug, author, published, missing, alreadyBroken, note, loadedAt, nextSlug } = props
  const [walls, setWalls] = useState<Wall[]>(props.walls)
  const [state, setState] = useState(props.state)
  const [saving, setSaving] = useState<'save' | 'hold' | 'approve' | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const total = walls.reduce((n, w) => n + w.breaks.length, 0)
  const problems = useMemo(() => {
    const out: string[] = []
    for (const w of walls) {
      pieces(w.words, w.breaks).forEach((n, i) => {
        if (n < MIN_PIECE_WORDS && w.breaks.length) {
          out.push(`¶${w.index + 1}: piece ${i + 1} is ${n} words; the minimum is ${MIN_PIECE_WORDS}.`)
        }
      })
    }
    return out
  }, [walls])

  function setBreaks(wall: number, breaks: number[]) {
    setWalls(ws => ws.map((w, i) => (i === wall ? { ...w, breaks: [...new Set(breaks)].sort((a, b) => a - b) } : w)))
    if (state !== 'applied') setState('pending')
    setMessage(null)
  }

  // A break moves between its neighbours, never past them or past the last sentence.
  function nudge(wall: number, k: number, by: -1 | 1) {
    const w = walls[wall]
    const lo = k === 0 ? 0 : w.breaks[k - 1] + 1
    const hi = k === w.breaks.length - 1 ? w.sentences.length - 2 : w.breaks[k + 1] - 1
    const at = Math.min(hi, Math.max(lo, w.breaks[k] + by))
    if (at !== w.breaks[k]) setBreaks(wall, w.breaks.map((b, i) => (i === k ? at : b)))
  }

  // A new break goes at the sentence nearest the middle of the piece, by words.
  function addInPiece(wall: number, piece: number) {
    const w = walls[wall]
    const from = piece === 0 ? 0 : w.breaks[piece - 1] + 1
    const to = piece === w.breaks.length ? w.sentences.length - 1 : w.breaks[piece]
    const size = w.words.slice(from, to + 1).reduce((a, b) => a + b, 0)
    let run = 0
    for (let s = from; s < to; s++) {
      run += w.words[s]
      if (run >= size / 2) return setBreaks(wall, [...w.breaks, s])
    }
  }

  async function send(action: 'save' | 'hold' | 'approve') {
    if (action === 'approve' && !window.confirm(`Insert ${total} paragraph break${total === 1 ? '' : 's'} into the text?`)) return
    setSaving(action)
    setMessage(null)
    try {
      const picks = walls.flatMap(w => w.breaks.map(sentence => ({ paragraph: w.index, sentence })))
      const res = await fetch(`/api/admin/review/paragraphs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks, action, loadedAt }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ tone: 'error', text: json.error ?? `Save failed (${res.status}).` })
        return
      }
      const next = (json.state ?? 'pending') as 'pending' | 'held' | 'applied'
      setState(next)
      setMessage({
        tone: 'ok',
        text:
          next === 'applied'
            ? `Applied ${total} break${total === 1 ? '' : 's'}. Every word checked unchanged; provenance note updated.`
            : next === 'held'
              ? total === 0 ? 'No breaks: held as reading fine.' : 'Held.'
              : 'Draft saved.',
      })
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach the server. Nothing was saved.' })
    } finally {
      setSaving(null)
    }
  }

  const applied = state === 'applied'

  return (
    <div className="pb-32">
      <header className="mb-5">
        <h1 className="text-lg font-semibold text-stone-800 leading-snug">{title}</h1>
        <p className="text-sm text-stone-500 mt-1">
          {author && <>{author} · </>}
          {walls.length} long paragraph{walls.length === 1 ? '' : 's'} · {total} break{total === 1 ? '' : 's'}
          {state === 'held' && <span className="text-amber-700"> · held</span>}
          {applied && <span className="text-green-700"> · applied</span>}
        </p>
        {published && (
          <a href={`/texts/${slug}`} target="_blank" rel="noreferrer" className="text-xs text-stone-400 underline mt-1 inline-block">
            Open the text ↗
          </a>
        )}
      </header>

      {applied ? (
        <p className="text-sm text-green-800 bg-green-50 border border-green-300 rounded px-3 py-2">
          These breaks are in the text. To change them now, edit the body in the text edit form.
        </p>
      ) : (
        <>
          {note && (
            <p className="text-sm text-stone-600 bg-stone-50 border border-stone-200 rounded px-3 py-2 mb-4">{note}</p>
          )}
          {alreadyBroken > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded px-3 py-2 mb-4">
              {alreadyBroken} proposed break{alreadyBroken === 1 ? ' is' : 's are'} already in the text (added by hand
              since the proposal) and {alreadyBroken === 1 ? 'is' : 'are'} not shown here.
            </p>
          )}
          {missing > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded px-3 py-2 mb-4">
              The body has changed since this proposal was made: {missing} break{missing === 1 ? '' : 's'} could
              not be found and {missing === 1 ? 'was' : 'were'} dropped. Check the rest, or redraft.
            </p>
          )}

          <ol className="space-y-6">
            {walls.map((w, wi) => {
              const sizes = pieces(w.words, w.breaks)
              return (
                <li key={w.index} className="border border-stone-300 rounded p-3">
                  <p className="text-xs text-stone-400 tabular-nums">
                    ¶{w.index + 1} · {w.words.reduce((a, b) => a + b, 0)} words → {sizes.join(' / ')}
                  </p>

                  <ol className="mt-2 space-y-3">
                    {w.breaks.map((b, k) => (
                      <li key={k} className="border-l-2 border-stone-300 pl-3">
                        <p className="text-sm text-stone-500 leading-relaxed">{tail(w.sentences[b])}</p>
                        <div className="my-2 flex items-stretch gap-2">
                          <button
                            type="button"
                            onClick={() => nudge(wi, k, -1)}
                            aria-label="Move this break one sentence earlier"
                            className="shrink-0 w-11 h-11 border border-stone-300 rounded text-stone-600"
                          >
                            ‹
                          </button>
                          <span className="flex-1 self-center text-center text-xs uppercase tracking-wide text-stone-400">
                            new paragraph
                          </span>
                          <button
                            type="button"
                            onClick={() => nudge(wi, k, 1)}
                            aria-label="Move this break one sentence later"
                            className="shrink-0 w-11 h-11 border border-stone-300 rounded text-stone-600"
                          >
                            ›
                          </button>
                          <button
                            type="button"
                            onClick={() => setBreaks(wi, w.breaks.filter((_, i) => i !== k))}
                            className="shrink-0 px-3 h-11 border border-stone-300 rounded text-xs text-stone-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                        <p className="text-sm text-stone-800 leading-relaxed">{head(w.sentences[b + 1])}</p>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-3 flex flex-wrap gap-x-4">
                    {sizes.map((n, p) =>
                      n > TARGET_MAX_WORDS && sentenceCount(w, p) > 1 ? (
                        <button key={p} type="button" onClick={() => addInPiece(wi, p)} className="text-xs text-stone-500 py-2">
                          + Break piece {p + 1} ({n} words)
                        </button>
                      ) : null
                    )}
                  </div>

                  <details className="mt-2">
                    <summary className="text-xs text-stone-500 cursor-pointer py-2">Read it with these breaks</summary>
                    <div className="mt-2 space-y-3 text-sm text-stone-700 leading-relaxed">
                      {[-1, ...w.breaks].map((from, p) => {
                        const to = p === w.breaks.length ? w.sentences.length - 1 : w.breaks[p]
                        return <p key={p}>{w.sentences.slice(from + 1, to + 1).join(' ')}</p>
                      })}
                    </div>
                  </details>
                </li>
              )
            })}
          </ol>

          {problems.length > 0 && (
            <ul className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 list-disc list-inside">
              {problems.map(p => <li key={p}>{p}</li>)}
            </ul>
          )}
        </>
      )}

      {message && (
        <p
          className={`mt-4 text-sm rounded px-3 py-2 border ${
            message.tone === 'ok' ? 'text-green-800 bg-green-50 border-green-300' : 'text-red-700 bg-red-50 border-red-200'
          }`}
        >
          {message.text}
          {message.tone === 'ok' && state !== 'pending' && nextSlug && (
            <> <Link href={`/admin/review/paragraphs/${nextSlug}`} className="underline">Next text →</Link></>
          )}
        </p>
      )}

      {!applied && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-3 flex gap-2">
          <button
            type="button"
            onClick={() => send('save')}
            disabled={saving !== null || problems.length > 0}
            className="flex-1 border border-stone-300 rounded py-3 text-sm text-stone-700 disabled:opacity-40"
          >
            {saving === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => send('hold')}
            disabled={saving !== null || problems.length > 0 || state === 'held'}
            className="flex-1 border border-stone-300 rounded py-3 text-sm text-stone-700 disabled:opacity-40"
          >
            {saving === 'hold' ? 'Holding…' : state === 'held' ? 'Held' : 'Hold'}
          </button>
          <button
            type="button"
            onClick={() => send('approve')}
            disabled={saving !== null || problems.length > 0 || total === 0}
            className="flex-1 rounded py-3 text-sm bg-stone-800 text-white active:bg-stone-700 disabled:opacity-40"
          >
            {saving === 'approve' ? 'Applying…' : 'Approve'}
          </button>
        </div>
      )}
    </div>
  )
}
