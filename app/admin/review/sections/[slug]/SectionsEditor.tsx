'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { MAX_LABEL, MAX_SECTIONS, MIN_SECTIONS, validatePicks } from '@/scripts/lib/sections.mjs'

type Pick = { label: string; paragraph: number }

type Props = {
  id: string
  title: string
  slug: string
  author: string | null
  published: boolean
  /** The opening words of every paragraph, in order. */
  openings: string[]
  initialPicks: Pick[]
  /** Draft sections whose start could not be found in the body any more. */
  missing: string[]
  approved: boolean
  nextSlug: string | null
}

/**
 * One text's sections, edited on a phone: rename a section, nudge where it
 * starts a paragraph at a time, add or remove one, then Approve. The start is
 * held as a paragraph index here; the server turns it into an anchor (the
 * paragraph's opening words) when it saves, so nothing typed here can point at
 * text that is not in the body.
 */
export default function SectionsEditor(props: Props) {
  const { id, title, slug, author, published, openings, missing, nextSlug } = props
  const [picks, setPicks] = useState<Pick[]>(props.initialPicks)
  const [approved, setApproved] = useState(props.approved)
  const [saving, setSaving] = useState<'draft' | 'approve' | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const problems = useMemo(() => validatePicks(picks, openings.length) as string[], [picks, openings.length])

  function update(index: number, change: Partial<Pick>) {
    setPicks(ps => ps.map((p, i) => (i === index ? { ...p, ...change } : p)))
    setApproved(false)
    setMessage(null)
  }

  // A start can move between the previous section's start and the next one's.
  function nudge(index: number, by: -1 | 1) {
    const lo = index === 0 ? 0 : picks[index - 1].paragraph + 1
    const hi = index === picks.length - 1 ? openings.length - 1 : picks[index + 1].paragraph - 1
    const at = Math.min(hi, Math.max(lo, picks[index].paragraph + by))
    if (at !== picks[index].paragraph) update(index, { paragraph: at })
  }

  function remove(index: number) {
    setPicks(ps => ps.filter((_, i) => i !== index))
    setApproved(false)
    setMessage(null)
  }

  // A new section starts halfway between this one and the next (or the end).
  function addAfter(index: number) {
    const from = picks[index].paragraph
    const to = index === picks.length - 1 ? openings.length : picks[index + 1].paragraph
    const at = Math.floor((from + to) / 2)
    if (at <= from) return
    setPicks(ps => [...ps.slice(0, index + 1), { label: '', paragraph: at }, ...ps.slice(index + 1)])
    setApproved(false)
    setMessage(null)
  }

  async function save(approve: boolean) {
    setSaving(approve ? 'approve' : 'draft')
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/review/sections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks, approve }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ tone: 'error', text: json.error ?? `Save failed (${res.status}).` })
        return
      }
      if (approve) setApproved(true)
      setMessage({ tone: 'ok', text: approve ? 'Approved.' : 'Draft saved.' })
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach the server. Nothing was saved.' })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="pb-32">
      <header className="mb-5">
        <h1 className="text-lg font-semibold text-stone-800 leading-snug">{title}</h1>
        <p className="text-sm text-stone-500 mt-1">
          {author && <>{author} · </>}
          {openings.length} paragraphs · {picks.length} sections
          {approved && <span className="text-green-700"> · approved</span>}
        </p>
        {published && (
          <a href={`/texts/${slug}`} target="_blank" rel="noreferrer" className="text-xs text-stone-400 underline mt-1 inline-block">
            Open the text ↗
          </a>
        )}
      </header>

      {missing.length > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded px-3 py-2 mb-4">
          The body has changed since this draft was made: {missing.join(', ')} could not be found and
          {missing.length === 1 ? ' was' : ' were'} dropped. Check the remaining sections, or redraft.
        </p>
      )}

      <ol className="space-y-3">
        {picks.map((p, i) => {
          const end = i === picks.length - 1 ? openings.length : picks[i + 1].paragraph
          return (
            <li key={i} className="border border-stone-300 rounded p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-stone-400 tabular-nums">
                  Section {i + 1} · ¶{p.paragraph + 1}–{end} ({end - p.paragraph} paragraphs)
                </span>
                {/* The first section always starts the text, so only later ones can go. */}
                {i > 0 && picks.length > MIN_SECTIONS && (
                  <button type="button" onClick={() => remove(i)} className="text-xs text-stone-400 hover:text-red-700 py-1">
                    Remove
                  </button>
                )}
              </div>

              <label className="block mt-2">
                <span className="sr-only">Section {i + 1} title</span>
                <input
                  value={p.label}
                  maxLength={MAX_LABEL}
                  onChange={e => update(i, { label: e.target.value })}
                  placeholder="Section title"
                  className="w-full border border-stone-300 rounded px-3 py-2 text-base text-stone-800"
                />
              </label>

              <div className="mt-2 flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => nudge(i, -1)}
                  disabled={i === 0}
                  aria-label={`Start section ${i + 1} one paragraph earlier`}
                  className="shrink-0 w-11 border border-stone-300 rounded text-stone-600 disabled:opacity-30"
                >
                  ‹
                </button>
                <p className="flex-1 text-sm text-stone-600 leading-relaxed bg-stone-50 rounded px-3 py-2">
                  <span className="text-stone-400 tabular-nums">¶{p.paragraph + 1} </span>
                  {openings[p.paragraph]}
                </p>
                <button
                  type="button"
                  onClick={() => nudge(i, 1)}
                  disabled={i === 0}
                  aria-label={`Start section ${i + 1} one paragraph later`}
                  className="shrink-0 w-11 border border-stone-300 rounded text-stone-600 disabled:opacity-30"
                >
                  ›
                </button>
              </div>

              {picks.length < MAX_SECTIONS && end - p.paragraph > 1 && (
                <button type="button" onClick={() => addAfter(i)} className="mt-2 text-xs text-stone-500 py-1">
                  + Add a section inside this one
                </button>
              )}
            </li>
          )
        })}
      </ol>

      {problems.length > 0 && (
        <ul className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 list-disc list-inside">
          {problems.map(p => <li key={p}>{p}</li>)}
        </ul>
      )}

      {message && (
        <p
          className={`mt-4 text-sm rounded px-3 py-2 border ${
            message.tone === 'ok' ? 'text-green-800 bg-green-50 border-green-300' : 'text-red-700 bg-red-50 border-red-200'
          }`}
        >
          {message.text}
          {message.tone === 'ok' && approved && nextSlug && (
            <> <Link href={`/admin/review/sections/${nextSlug}`} className="underline">Next text →</Link></>
          )}
        </p>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-3 flex gap-2">
        <button
          type="button"
          onClick={() => save(false)}
          disabled={saving !== null || problems.length > 0}
          className="flex-1 border border-stone-300 rounded py-3 text-sm text-stone-700 disabled:opacity-40"
        >
          {saving === 'draft' ? 'Saving…' : 'Save draft'}
        </button>
        <button
          type="button"
          onClick={() => save(true)}
          disabled={saving !== null || problems.length > 0 || approved}
          className={`flex-1 rounded py-3 text-sm disabled:opacity-60 ${
            approved ? 'bg-green-50 border border-green-300 text-green-800' : 'bg-stone-800 text-white active:bg-stone-700'
          }`}
        >
          {saving === 'approve' ? 'Approving…' : approved ? 'Approved ✓' : 'Approve'}
        </button>
      </div>
    </div>
  )
}
