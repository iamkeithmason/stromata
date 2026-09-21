'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Progress, ProvenanceSummary, ReviewState } from '@/lib/review/queue'
import { PROVENANCE_FIELDS } from '@/lib/review/queue'

const SUMMARY_MAX = 160
const AUTOSAVE_MS = 900

export type ReviewCard = {
  id: string
  title: string
  slug: string
  position: number
  total: number
  introduction: string
  hadNoDraft: boolean
  summary: string
  reviewState: ReviewState
  reviewNote: string | null
  ocrQuality: string | null
  wordCount: number
  themes: string[]
  spot: { head: string; middle: string | null }
  warnings: string[]
}

export type CollectionHeader = {
  id: string | null
  slug: string
  title: string
  author: string | null
  published: boolean
  descriptionDraft: string | null
  descriptionApproved: boolean
  description: string | null
  provenanceVerifiedAt: string | null
  requiresProvenanceGate: boolean
  provenance: ProvenanceSummary
}

type Props = {
  header: CollectionHeader
  cards: ReviewCard[]
  progress: Progress
  page: number
  pageCount: number
  resumeId: string | null
}

export default function ReviewClient({ header, cards, progress, page, pageCount, resumeId }: Props) {
  const [verifiedAt, setVerifiedAt] = useState(header.provenanceVerifiedAt)
  const [descriptionApproved, setDescriptionApproved] = useState(header.descriptionApproved)
  const [states, setStates] = useState<Record<string, ReviewState>>(
    () => Object.fromEntries(cards.map(c => [c.id, c.reviewState]))
  )
  const [error, setError] = useState<string | null>(null)

  const gateOpen = !header.requiresProvenanceGate || !!verifiedAt
  const approvedOnPage = cards.filter(c => states[c.id] === 'approved')

  // Resume: scroll the first undecided card into view once, on load.
  useEffect(() => {
    if (!resumeId) return
    const el = document.getElementById(`card-${resumeId}`)
    if (!el) return
    // rAF so the scroll happens after the first paint, or Safari lands short.
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
  }, [resumeId])

  return (
    <div className="pb-32">
      <header className="mb-5">
        <h1 className="text-lg font-semibold text-stone-800 leading-snug">{header.title}</h1>
        <p className="text-sm text-stone-500 mt-1">
          {header.author && <>{header.author} · </>}
          {progress.total} draft{progress.total === 1 ? '' : 's'} · {progress.approved} approved
          {progress.held > 0 && <> · {progress.held} held</>}
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4"
        >
          {error}
        </p>
      )}

      {header.requiresProvenanceGate && (
        <ProvenanceCard
          header={header}
          verifiedAt={verifiedAt}
          onVerified={setVerifiedAt}
          onError={setError}
        />
      )}

      {header.id && header.descriptionDraft && (
        <DescriptionCard
          collectionId={header.id}
          draft={header.description ?? header.descriptionDraft}
          approved={descriptionApproved}
          onApproved={() => setDescriptionApproved(true)}
          onError={setError}
        />
      )}

      <ol className="space-y-5">
        {cards.map(card => (
          <TextCard
            key={card.id}
            card={card}
            state={states[card.id]}
            gateOpen={gateOpen}
            onState={(next) => setStates(s => ({ ...s, [card.id]: next }))}
            onError={setError}
          />
        ))}
      </ol>

      {pageCount > 1 && (
        <nav className="flex items-center justify-between mt-6 text-sm" aria-label="Pages">
          {page > 1 ? (
            <Link
              href={`/admin/review/${header.slug}?page=${page - 1}`}
              className="px-4 py-3 border border-stone-300 rounded text-stone-700 active:bg-stone-100"
            >
              ← Previous
            </Link>
          ) : <span />}
          <span className="text-stone-400 tabular-nums">Page {page} of {pageCount}</span>
          {page < pageCount ? (
            <Link
              href={`/admin/review/${header.slug}?page=${page + 1}`}
              className="px-4 py-3 border border-stone-300 rounded text-stone-700 active:bg-stone-100"
            >
              Next →
            </Link>
          ) : <span />}
        </nav>
      )}

      <PublishBar
        collectionId={header.id}
        collectionPublished={header.published}
        descriptionApproved={descriptionApproved}
        hasDescriptionDraft={!!header.descriptionDraft}
        approved={approvedOnPage}
        gateOpen={gateOpen}
        onError={setError}
      />
    </div>
  )
}

// ── Provenance gate ──────────────────────────────────────────────────────────

function ProvenanceCard({
  header, verifiedAt, onVerified, onError,
}: {
  header: CollectionHeader
  verifiedAt: string | null
  onVerified: (at: string | null) => void
  onError: (msg: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const { provenance } = header

  async function verify() {
    if (!header.id) return
    setBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/admin/review/collections/${header.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verify_provenance: !verifiedAt }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not save.')
      onVerified(json.provenance_verified_at ?? null)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border border-stone-300 rounded p-4 mb-5 bg-white">
      <h2 className="text-sm font-semibold text-stone-800">Provenance</h2>

      {!provenance.consistent && (
        <div className="mt-3 border border-amber-300 bg-amber-50 rounded px-3 py-2">
          <p className="text-xs font-semibold text-amber-800">
            The texts in this collection do not agree on their provenance.
          </p>
          <p className="text-xs text-amber-800 mt-1">
            A collection should come from one source. Check these before verifying.
          </p>
          {provenance.conflicts.map(conflict => (
            <div key={conflict.field} className="mt-2">
              <p className="text-xs font-medium text-amber-900">{conflict.label}</p>
              <ul className="mt-1 space-y-1">
                {conflict.values.map((v, i) => (
                  <li key={i} className="text-xs text-stone-700">
                    <span className="italic">{v.value ?? '(empty)'}</span>
                    <span className="text-stone-500"> — {v.titles.length} text{v.titles.length === 1 ? '' : 's'}: {v.titles.slice(0, 3).join(', ')}{v.titles.length > 3 ? '…' : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <dl className="mt-3 space-y-2">
        {PROVENANCE_FIELDS.map(([field, label]) => {
          const value = provenance.shared[field]
          if (!value) return null
          return (
            <div key={field}>
              <dt className="text-xs text-stone-400 uppercase tracking-wide">{label}</dt>
              <dd className="text-sm text-stone-700 break-words">
                {field === 'source_url' ? (
                  <a
                    href={value}
                    target="_blank"
                    rel="noreferrer"
                    className="text-stone-700 underline break-all"
                  >
                    {value}
                  </a>
                ) : value}
              </dd>
            </div>
          )
        })}
      </dl>

      <button
        type="button"
        onClick={verify}
        disabled={busy || !header.id}
        className={`mt-4 w-full min-h-[48px] rounded font-medium text-sm transition-colors ${
          verifiedAt
            ? 'bg-green-50 border border-green-300 text-green-800'
            : 'bg-stone-800 text-white active:bg-stone-700'
        } disabled:opacity-50`}
      >
        {busy ? 'Saving…' : verifiedAt ? '✓ Provenance verified — tap to undo' : 'Verify provenance'}
      </button>

      {!verifiedAt && (
        <p className="text-xs text-stone-500 mt-2">
          Approving is disabled until provenance is verified.
        </p>
      )}
    </section>
  )
}

// ── Collection description ───────────────────────────────────────────────────

function DescriptionCard({
  collectionId, draft, approved, onApproved, onError,
}: {
  collectionId: string
  draft: string
  approved: boolean
  onApproved: () => void
  onError: (msg: string | null) => void
}) {
  const [value, setValue] = useState(draft)
  const [busy, setBusy] = useState(false)
  const saved = useAutosave(
    `/api/admin/review/collections/${collectionId}`,
    useCallback((v: string) => ({ description_draft: v }), []),
    value,
    draft,
    onError
  )

  async function approve() {
    setBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/admin/review/collections/${collectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description_draft: value, approve_description: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not approve.')
      onApproved()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not approve.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border border-stone-300 rounded p-4 mb-5 bg-white">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-stone-800">Collection description</h2>
        <SavedHint saved={saved} />
      </div>
      <AutoTextarea value={value} onChange={setValue} rows={6} label="Collection description" />
      <button
        type="button"
        onClick={approve}
        disabled={busy || approved}
        className={`mt-3 w-full min-h-[48px] rounded font-medium text-sm ${
          approved
            ? 'bg-green-50 border border-green-300 text-green-800'
            : 'bg-stone-800 text-white active:bg-stone-700'
        } disabled:opacity-60`}
      >
        {busy ? 'Saving…' : approved ? '✓ Description approved' : 'Approve description'}
      </button>
      {!approved && (
        <p className="text-xs text-stone-500 mt-2">
          The collection page stays unpublished until its description is approved.
        </p>
      )}
    </section>
  )
}

// ── One text card ────────────────────────────────────────────────────────────

function TextCard({
  card, state, gateOpen, onState, onError,
}: {
  card: ReviewCard
  state: ReviewState
  gateOpen: boolean
  onState: (next: ReviewState) => void
  onError: (msg: string | null) => void
}) {
  const [introduction, setIntroduction] = useState(card.introduction)
  const [summary, setSummary] = useState(card.summary)
  const [showSpot, setShowSpot] = useState(false)
  const [holding, setHolding] = useState(false)
  const [holdNote, setHoldNote] = useState(card.reviewNote ?? '')

  const introSaved = useAutosave(
    `/api/admin/review/texts/${card.id}`,
    useCallback((v: string) => ({ editorial_introduction: v }), []),
    introduction,
    card.introduction,
    onError
  )
  const summarySaved = useAutosave(
    `/api/admin/review/texts/${card.id}`,
    useCallback((v: string) => ({ summary_draft: v }), []),
    summary,
    card.summary,
    onError,
    summary.length > SUMMARY_MAX // never autosave a value the server will reject
  )

  const over = summary.length > SUMMARY_MAX
  const canApprove = gateOpen && introduction.trim().length > 0 && summary.trim().length > 0 && !over

  async function setState(next: ReviewState, note?: string) {
    const previous = state
    onState(next) // optimistic
    onError(null)
    try {
      const res = await fetch(`/api/admin/review/texts/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          next === 'held' ? { review_state: next, review_note: note ?? null } : { review_state: next }
        ),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Could not save.')
      }
    } catch (err) {
      onState(previous) // rollback
      onError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <li
      id={`card-${card.id}`}
      className={`border rounded bg-white scroll-mt-4 ${
        state === 'approved' ? 'border-green-400'
          : state === 'held' ? 'border-amber-400'
          : 'border-stone-300'
      }`}
    >
      <div className="p-4">
        <p className="text-xs text-stone-400 tabular-nums">
          {card.position} of {card.total}
          {card.ocrQuality && <> · OCR {card.ocrQuality}</>}
          {card.wordCount > 0 && <> · {card.wordCount.toLocaleString()} words</>}
        </p>
        <h3 className="text-base font-semibold text-stone-800 mt-1 leading-snug">{card.title}</h3>
        {card.themes.length > 0 && (
          <p className="text-xs text-stone-400 mt-1">{card.themes.join(' · ')}</p>
        )}

        {card.warnings.length > 0 && (
          <ul className="mt-3 border border-amber-300 bg-amber-50 rounded px-3 py-2 space-y-1">
            {card.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-800">{w}</li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <label className="text-xs text-stone-400 uppercase tracking-wide" htmlFor={`intro-${card.id}`}>
              Introduction
              {card.hadNoDraft && <span className="normal-case text-amber-600"> — generated, no prior draft</span>}
            </label>
            <SavedHint saved={introSaved} />
          </div>
          <AutoTextarea
            id={`intro-${card.id}`}
            value={introduction}
            onChange={setIntroduction}
            rows={6}
            label="Introduction"
          />
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <label className="text-xs text-stone-400 uppercase tracking-wide" htmlFor={`summary-${card.id}`}>
              Summary
            </label>
            <span className="flex items-baseline gap-2">
              <SavedHint saved={summarySaved} />
              <span className={`text-xs tabular-nums ${over ? 'text-red-600 font-semibold' : 'text-stone-400'}`}>
                {summary.length}/{SUMMARY_MAX}
              </span>
            </span>
          </div>
          <AutoTextarea
            id={`summary-${card.id}`}
            value={summary}
            onChange={setSummary}
            rows={3}
            label="Summary"
            invalid={over}
          />
          {over && (
            <p className="text-xs text-red-600 mt-1">
              Too long to publish — trim {summary.length - SUMMARY_MAX} character
              {summary.length - SUMMARY_MAX === 1 ? '' : 's'}. This is not being saved.
            </p>
          )}
        </div>

        <details
          className="mt-4"
          open={showSpot}
          onToggle={(e) => setShowSpot((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="text-xs text-stone-500 cursor-pointer select-none py-2">
            Spot-check the text
          </summary>
          <blockquote className="mt-1 border-l-2 border-stone-200 pl-3 text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">
            {card.spot.head}
          </blockquote>
          {card.spot.middle && (
            <>
              <p className="text-xs text-stone-400 mt-3 mb-1">…from the middle…</p>
              <blockquote className="border-l-2 border-stone-200 pl-3 text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">
                {card.spot.middle}
              </blockquote>
            </>
          )}
        </details>
      </div>

      {/* Action bar — 48px minimum targets, per the phone brief. */}
      <div className="border-t border-stone-200 p-3 flex gap-3">
        <button
          type="button"
          onClick={() => setState(state === 'approved' ? 'pending' : 'approved')}
          disabled={!canApprove && state !== 'approved'}
          className={`flex-1 min-h-[48px] rounded font-medium text-sm ${
            state === 'approved'
              ? 'bg-green-600 text-white'
              : 'bg-stone-800 text-white active:bg-stone-700'
          } disabled:bg-stone-200 disabled:text-stone-400`}
        >
          {state === 'approved' ? '✓ Approved' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (state === 'held') { setState('pending'); setHolding(false) }
            else setHolding(h => !h)
          }}
          className={`flex-1 min-h-[48px] rounded font-medium text-sm border ${
            state === 'held'
              ? 'bg-amber-100 border-amber-400 text-amber-900'
              : 'border-stone-300 text-stone-700 active:bg-stone-100'
          }`}
        >
          {state === 'held' ? '✓ Held' : 'Hold'}
        </button>
      </div>

      {holding && state !== 'held' && (
        <div className="border-t border-stone-200 p-3">
          <label className="text-xs text-stone-400 uppercase tracking-wide" htmlFor={`hold-${card.id}`}>
            Why hold this? (optional)
          </label>
          <input
            id={`hold-${card.id}`}
            value={holdNote}
            onChange={(e) => setHoldNote(e.target.value)}
            className="mt-1 w-full border border-stone-300 rounded px-3 py-3 text-base"
            placeholder="OCR needs another pass…"
          />
          <button
            type="button"
            onClick={() => { setState('held', holdNote); setHolding(false) }}
            className="mt-2 w-full min-h-[48px] rounded bg-amber-600 text-white font-medium text-sm active:bg-amber-700"
          >
            Hold this text
          </button>
        </div>
      )}

      {state === 'held' && card.reviewNote && (
        <p className="border-t border-stone-200 px-4 py-2 text-xs text-amber-800">
          Held: {card.reviewNote}
        </p>
      )}

      {!gateOpen && state !== 'approved' && (
        <p className="border-t border-stone-200 px-4 py-2 text-xs text-stone-500">
          Verify provenance above to enable Approve.
        </p>
      )}
    </li>
  )
}

// ── Publish ──────────────────────────────────────────────────────────────────

type PublishOutcome = {
  published: { id: string; title: string; slug: string }[]
  refused: { id: string; title: string; reason: string; detail: string }[]
  collection: { ok: true; title: string; slug: string } | { ok: false; reason: string; detail: string } | null
}

function PublishBar({
  collectionId, collectionPublished, descriptionApproved, hasDescriptionDraft, approved, gateOpen, onError,
}: {
  collectionId: string | null
  collectionPublished: boolean
  descriptionApproved: boolean
  hasDescriptionDraft: boolean
  approved: ReviewCard[]
  gateOpen: boolean
  onError: (msg: string | null) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<PublishOutcome | null>(null)

  async function publish() {
    setBusy(true)
    onError(null)
    try {
      const res = await fetch('/api/admin/review/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text_ids: approved.map(c => c.id), collection_id: collectionId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not publish.')
      setOutcome(json)
      setConfirming(false)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not publish.')
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  if (outcome) {
    return (
      <div className="fixed inset-x-0 bottom-0 bg-white border-t border-stone-300 p-4 max-h-[70vh] overflow-y-auto">
        <p className="text-sm font-semibold text-stone-800">
          Published {outcome.published.length} text{outcome.published.length === 1 ? '' : 's'}.
        </p>
        {outcome.collection?.ok && (
          <p className="text-xs text-green-700 mt-1">Collection published.</p>
        )}
        {outcome.collection && !outcome.collection.ok && outcome.collection.reason !== 'already_published' && (
          <p className="text-xs text-amber-700 mt-1">
            Collection not published — {outcome.collection.detail}
          </p>
        )}
        {outcome.refused.length > 0 && (
          <>
            <p className="text-xs font-semibold text-amber-800 mt-3">
              {outcome.refused.length} not published:
            </p>
            <ul className="mt-1 space-y-1">
              {outcome.refused.map(r => (
                <li key={r.id} className="text-xs text-stone-700">
                  <span className="font-medium">{r.title}</span> — {r.detail}
                </li>
              ))}
            </ul>
          </>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 w-full min-h-[48px] rounded bg-stone-800 text-white font-medium text-sm"
        >
          Reload the queue
        </button>
      </div>
    )
  }

  if (approved.length === 0) return null

  return (
    <div className="fixed inset-x-0 bottom-0 bg-white border-t border-stone-300 p-3">
      {confirming ? (
        <div className="max-h-[60vh] overflow-y-auto">
          <p className="text-sm font-semibold text-stone-800">
            Publish {approved.length} text{approved.length === 1 ? '' : 's'}?
          </p>
          <ul className="mt-2 space-y-1">
            {approved.map(c => (
              <li key={c.id} className="text-xs text-stone-600">{c.title}</li>
            ))}
          </ul>
          {collectionId && !collectionPublished && (
            <p className="text-xs text-stone-500 mt-2">
              {descriptionApproved
                ? 'The collection page will be published too.'
                : hasDescriptionDraft
                  ? 'The collection page stays unpublished — its description is not approved.'
                  : 'The collection page stays unpublished — it has no description.'}
            </p>
          )}
          <div className="flex gap-3 mt-3">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="flex-1 min-h-[48px] rounded border border-stone-300 text-stone-700 font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={publish}
              disabled={busy}
              className="flex-1 min-h-[48px] rounded bg-green-700 text-white font-medium text-sm active:bg-green-800 disabled:opacity-60"
            >
              {busy ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!gateOpen}
          className="w-full min-h-[48px] rounded bg-green-700 text-white font-semibold text-sm active:bg-green-800 disabled:bg-stone-200 disabled:text-stone-400"
        >
          Publish {approved.length} approved
        </button>
      )}
    </div>
  )
}

// ── Shared bits ──────────────────────────────────────────────────────────────

/**
 * Debounced save of one field.
 *
 * The queue is used on a phone that locks, loses signal, or gets interrupted
 * mid-sentence, so an edit has to reach the server without anyone pressing
 * Save. `skip` suppresses saves the server would reject anyway (an over-length
 * summary), so the counter is the only feedback rather than a 400 per keystroke.
 */
function useAutosave(
  url: string,
  toPayload: (value: string) => Record<string, string>,
  value: string,
  initial: string,
  onError: (msg: string | null) => void,
  skip = false
): 'idle' | 'saving' | 'saved' {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const lastSaved = useRef(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (skip) return
    if (value === lastSaved.current) return

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setStatus('saving')
      try {
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toPayload(value)),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error ?? 'Could not save.')
        }
        lastSaved.current = value
        setStatus('saved')
      } catch (err) {
        setStatus('idle')
        onError(err instanceof Error ? err.message : 'Could not save.')
      }
    }, AUTOSAVE_MS)

    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value, url, toPayload, onError, skip])

  return status
}

function SavedHint({ saved }: { saved: 'idle' | 'saving' | 'saved' }) {
  if (saved === 'idle') return null
  return (
    <span className="text-xs text-stone-400" aria-live="polite">
      {saved === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  )
}

/**
 * A textarea that grows with its content.
 *
 * 16px text minimum (`text-base`): iOS Safari zooms the whole page when a
 * focused input's text is smaller, which on a review card means losing your
 * place on every tap.
 */
function AutoTextarea({
  id, value, onChange, rows, label, invalid,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  rows: number
  label: string
  invalid?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      id={id}
      ref={ref}
      rows={rows}
      value={value}
      aria-label={label}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={`mt-1 w-full border rounded px-3 py-2 text-base leading-relaxed resize-none overflow-hidden ${
        invalid ? 'border-red-400' : 'border-stone-300'
      }`}
    />
  )
}
