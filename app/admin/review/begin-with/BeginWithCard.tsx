'use client'

import { useMemo, useState } from 'react'
import { NOTE_MAX, samePick, validatePick } from '@/scripts/lib/begin-with.mjs'

export type Pick = { kind: 'text' | 'collection'; slug: string; note: string }
export type Candidate = { kind: 'text' | 'collection'; slug: string; title: string; form: string | null; words: number; parts: number; about: string }

type Props = {
  id: string
  name: string
  slug: string | null
  candidates: Candidate[]
  draft: Pick | null
  live: Pick | null
  skipped: boolean
}

const keyOf = (c: { kind: string; slug: string }) => `${c.kind}:${c.slug}`

/** One author's pick, edited on a phone: choose a work, rewrite the line, Approve or Skip. */
export default function BeginWithCard({ id, name, slug, candidates, draft, live, skipped: wasSkipped }: Props) {
  const start = draft ?? live
  const [choice, setChoice] = useState(start ? keyOf(start) : candidates[0] ? keyOf(candidates[0]) : '')
  const [note, setNote] = useState(start?.note ?? '')
  const [saved, setSaved] = useState<Pick | null>(live)
  const [skipped, setSkipped] = useState(wasSkipped)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const chosen = candidates.find(c => keyOf(c) === choice) ?? null
  const pick = useMemo<Pick | null>(() => (chosen ? { kind: chosen.kind, slug: chosen.slug, note } : null), [chosen, note])
  const problems = useMemo(() => (validatePick(pick, candidates) as string[]), [pick, candidates])
  const isLive = !skipped && samePick(pick, saved)

  async function send(action: 'approve' | 'skip') {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/review/begin-with/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'skip' ? { action } : { action, pick }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed.')
      if (action === 'skip') {
        setSkipped(true)
        setSaved(null)
        setMessage({ tone: 'ok', text: 'Skipped: no pick on this author page.' })
      } else {
        setSkipped(false)
        setSaved(pick)
        setMessage({ tone: 'ok', text: 'Approved: live on the author page.' })
      }
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`border rounded p-4 ${isLive ? 'border-stone-200' : 'border-stone-300'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium text-stone-800">{name}</h3>
        {slug && (
          <a href={`/authors/${slug}`} target="_blank" rel="noreferrer" className="text-xs text-stone-400 hover:text-stone-700">
            View page ↗
          </a>
        )}
      </div>

      <label className="block text-xs text-stone-500 mt-3" htmlFor={`bw-work-${id}`}>Work</label>
      <select
        id={`bw-work-${id}`}
        value={choice}
        onChange={e => { setChoice(e.target.value); setMessage(null) }}
        className="mt-1 w-full border border-stone-300 rounded px-2 py-2.5 text-sm bg-white"
      >
        {candidates.map(c => (
          <option key={keyOf(c)} value={keyOf(c)}>
            {c.title}{c.kind === 'collection' ? ` (${c.parts} parts)` : ''} · {c.form ?? 'no genre'} · {Math.max(1, Math.round(c.words / 200))} min
          </option>
        ))}
      </select>
      {chosen?.about && <p className="text-xs text-stone-400 mt-1 line-clamp-2">{chosen.about}</p>}

      <label className="block text-xs text-stone-500 mt-3" htmlFor={`bw-note-${id}`}>
        Why begin here ({note.trim().length}/{NOTE_MAX})
      </label>
      <textarea
        id={`bw-note-${id}`}
        value={note}
        onChange={e => { setNote(e.target.value); setMessage(null) }}
        rows={3}
        className="mt-1 w-full border border-stone-300 rounded px-2 py-2 text-sm font-serif italic"
      />

      {problems.length > 0 && <p className="text-xs text-amber-700 mt-1">{problems.join(' ')}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || problems.length > 0 || isLive}
          onClick={() => send('approve')}
          className="min-h-[44px] px-4 rounded bg-stone-800 text-white text-sm disabled:opacity-40"
        >
          {isLive ? 'Approved' : 'Approve'}
        </button>
        <button
          type="button"
          disabled={busy || skipped}
          onClick={() => send('skip')}
          className="min-h-[44px] px-4 rounded border border-stone-300 text-sm text-stone-600 disabled:opacity-40"
        >
          {skipped ? 'Skipped' : 'Skip'}
        </button>
      </div>
      {message && (
        <p className={`text-xs mt-2 ${message.tone === 'ok' ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>
      )}
    </div>
  )
}
