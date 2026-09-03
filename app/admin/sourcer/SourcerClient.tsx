'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StagedBundleSummary } from '@/lib/sourcer/staging'
import type { LiveStatus } from '@/lib/pipeline/liveStatus'
import { TRADITIONS, ERAS, GENRES, MAX_THEMES } from '@/lib/pipeline/vocab'
import { Field, inputCls, ThemePicker } from '@/app/admin/pipeline/PipelineClient'

type Bundle = StagedBundleSummary & { liveStatus: LiveStatus; liveHref: string | null }

function bridgeBadge(status: string | null) {
  if (!status) return null
  const cls =
    status === 'imported' ? 'bg-green-50 text-green-700 border-green-200'
    : status === 'rejected' ? 'bg-red-50 text-red-600 border-red-200'
    : 'bg-amber-50 text-amber-700 border-amber-200'
  return <span className={`text-xs px-1.5 py-0.5 rounded border ${cls}`}>{status}</span>
}

export default function SourcerClient({ bundles, isDev }: { bundles: Bundle[]; isDev: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState<{ slug: string; title: string; sourceUrl: string | null; files: { name: string; content: string }[] } | null>(null)
  const [bridging, setBridging] = useState<Bundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const liveCount = bundles.filter(b => b.liveStatus === 'live').length
  const visible = showAll ? bundles : bundles.filter(b => b.liveStatus !== 'live')

  async function viewBundle(b: Bundle) {
    setError(null)
    setLoading(b.slug)
    try {
      const res = await fetch(`/api/admin/sourcer/bundle?slug=${encodeURIComponent(b.slug)}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to read bundle'); return }
      setOpen({ slug: b.slug, title: b.title || b.slug, sourceUrl: b.sourceUrl, files: json.files })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setShowAll(false)}
          className={`text-xs px-2 py-1 rounded border ${!showAll ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'}`}
        >
          active <span className={!showAll ? 'text-stone-300' : 'text-stone-400'}>{bundles.length - liveCount}</span>
        </button>
        <button
          onClick={() => setShowAll(true)}
          className={`text-xs px-2 py-1 rounded border ${showAll ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'}`}
        >
          all <span className={showAll ? 'text-stone-300' : 'text-stone-400'}>{bundles.length}</span>
        </button>
        {liveCount > 0 && !showAll && (
          <span className="text-xs text-stone-400">· {liveCount} live bundle{liveCount === 1 ? '' : 's'} hidden</span>
        )}
      </div>

      <div className="border border-stone-200 rounded divide-y divide-stone-100">
        {visible.length === 0 && (
          <p className="px-4 py-6 text-sm text-stone-400">
            {bundles.length === 0
              ? <>No staged bundles right now. The Sourcer opens a draft PR with new ones once a month (or on demand); once
                merged to <code>main</code>, they show up here.</>
              : 'Nothing active — every staged bundle is live. Switch to "all" to see them.'}
          </p>
        )}
        {visible.map(b => (
          <div key={b.slug} className="px-4 py-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-stone-800 text-sm font-medium truncate">{b.title || b.slug}</span>
                {b.liveStatus === 'live' ? (
                  <span className="text-xs px-1.5 py-0.5 rounded border bg-green-50 text-green-700 border-green-200">● Live</span>
                ) : (
                  bridgeBadge(b.bridgeStatus)
                )}
                {b.flags.length > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200" title={b.flags.join('; ')}>
                    ⚑ {b.flags.length} flag{b.flags.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <p className="text-stone-400 text-xs mt-1">
                {b.author || 'Unknown author'}
                {b.genre ? ` · ${b.genre}` : ''}
                {b.collectionShape ? ` · ${b.collectionShape}` : ''}
                {b.ocrQuality ? ` · OCR ${b.ocrQuality}` : ''}
                {b.sourceUrl && (
                  <>
                    {' · '}
                    <a href={b.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-700">
                      source ↗
                    </a>
                  </>
                )}
              </p>
              {b.themes.length > 0 && (
                <p className="text-stone-400 text-xs mt-1">{b.themes.join(', ')}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 text-xs">
              <button
                onClick={() => viewBundle(b)}
                disabled={loading === b.slug}
                className="text-xs px-2 py-0.5 rounded border border-stone-300 text-stone-700 hover:border-stone-500 disabled:opacity-40"
              >
                {loading === b.slug ? 'Loading…' : 'Review'}
              </button>
              {b.liveStatus === 'live' && b.liveHref ? (
                <a href={b.liveHref} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline">
                  View live ↗
                </a>
              ) : isDev ? (
                b.bridgeStatus === 'imported' ? (
                  <a href="/admin/drafts" className="text-green-700 hover:underline">In Drafts →</a>
                ) : (
                  <button
                    onClick={() => { setBridging(b); setError(null) }}
                    className="text-xs px-2 py-0.5 rounded border border-amber-300 text-amber-700 hover:border-amber-500"
                    title="Bridge into the import queue, then run the import"
                  >
                    {b.bridgeStatus === 'rejected' ? 'Retry bridge & import' : 'Bridge & import'}
                  </button>
                )
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {open && <BundlePanel bundle={open} onClose={() => setOpen(null)} />}
      {bridging && (
        <BridgeModal
          bundle={bridging}
          onClose={() => setBridging(null)}
          onDone={() => { setBridging(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function BundlePanel({
  bundle, onClose,
}: {
  bundle: { slug: string; title: string; sourceUrl: string | null; files: { name: string; content: string }[] }
  onClose: () => void
}) {
  // Land on SOURCER.md (the human-readable summary) rather than the first file.
  const defaultIndex = Math.max(0, bundle.files.findIndex(f => f.name === 'SOURCER.md'))
  const [active, setActive] = useState(defaultIndex)
  const file = bundle.files[active]

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center overflow-auto z-20 p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6 my-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-stone-800">Staged bundle · {bundle.title}</h3>
          <button onClick={onClose} className="text-sm text-stone-400 hover:text-stone-800">Close</button>
        </div>

        {bundle.sourceUrl && (
          <p className="text-xs mb-3">
            <a href={bundle.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-stone-500 underline hover:text-stone-800">
              Open the source edition ↗
            </a>
            <span className="text-stone-400"> — compare against body.md below</span>
          </p>
        )}

        <p className="text-xs text-stone-400 mb-3">
          Read-only — nothing here is published or in the database until you run Bridge &amp; import. To confirm or
          edit the proposed genre / themes / collection structure before bridging, hand-edit{' '}
          <code>content/staging/{bundle.slug}/metadata.yml</code> first.
        </p>

        <div className="flex flex-wrap gap-1 mb-3">
          {bundle.files.map((f, i) => (
            <button
              key={f.name}
              onClick={() => setActive(i)}
              className={`text-xs px-2 py-0.5 rounded border ${i === active ? 'bg-stone-800 text-white border-stone-800' : 'text-stone-600 border-stone-200 hover:border-stone-400'}`}
            >
              {f.name}
            </button>
          ))}
        </div>

        <pre className="text-xs text-stone-700 bg-stone-50 border border-stone-100 rounded p-3 overflow-auto max-h-[32rem] whitespace-pre-wrap">{file.content}</pre>
      </div>
    </div>
  )
}

type BridgeForm = {
  by: 'single' | 'book'
  author: string
  title: string
  genre: string
  themes: string[]
  tradition: string
  era: string
  deathYear: string
  sourceAttribution: string
  translationNotes: string
  provenanceNotes: string
}

function BridgeModal({
  bundle, onClose, onDone,
}: {
  bundle: StagedBundleSummary
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState<BridgeForm>({
    // Default to 'single' regardless of the proposed collection shape: "book"
    // only works if body.md has literal `# … Book N` markdown headings, and
    // the metadata proposal's shape ('collection'/'excerpt') doesn't guarantee
    // that — e.g. a "Question N"-structured or heading-less body.md needs
    // 'single' even though its proposed shape isn't. Check the Review panel's
    // body.md tab before switching this to 'book'.
    by: 'single',
    author: bundle.author,
    title: bundle.title,
    genre: GENRES.includes(bundle.genre as (typeof GENRES)[number]) ? (bundle.genre as string) : '',
    themes: bundle.themes.slice(0, MAX_THEMES),
    tradition: '',
    era: '',
    deathYear: '',
    sourceAttribution: '',
    translationNotes: '',
    provenanceNotes: '',
  })
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState('')
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const set = (patch: Partial<BridgeForm>) => setForm(f => ({ ...f, ...patch }))
  const toggleTheme = (t: string) => {
    if (form.themes.includes(t)) set({ themes: form.themes.filter(x => x !== t) })
    else if (form.themes.length < MAX_THEMES) set({ themes: [...form.themes, t] })
  }

  const canSubmit =
    !running && form.author.trim() && form.title.trim() && form.genre && form.themes.length > 0 &&
    form.tradition && form.deathYear.trim() !== '' && Number.isFinite(Number(form.deathYear))

  // Streams one POST's response body into the shared log; returns the process
  // exit code parsed from its final "[process exited with code N]" line.
  async function streamStep(url: string, body: unknown, signal: AbortSignal): Promise<number | null> {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
    })
    if (!res.ok || !res.body) {
      const msg = await res.json().then(j => j.error).catch(() => 'Run failed')
      setLog(prev => prev + `\n[error] ${msg}\n`)
      return null
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let full = ''
    for (;;) {
      const { done: streamDone, value } = await reader.read()
      if (streamDone) break
      const chunk = decoder.decode(value, { stream: true })
      full += chunk
      setLog(prev => prev + chunk)
    }
    const m = full.match(/\[process exited with code (-?\d+)\]/)
    return m ? Number(m[1]) : null
  }

  async function run() {
    setRunning(true)
    setDone(false)
    setFailed(false)
    setLog('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      setLog('— Step 1/2: bridging bundle into the import queue —\n\n')
      const bridgeCode = await streamStep('/api/admin/sourcer/bridge', {
        slug: bundle.slug,
        by: form.by,
        author: form.author.trim(),
        title: form.title.trim(),
        genre: form.genre,
        themes: form.themes,
        tradition: form.tradition,
        era: form.era || undefined,
        deathYear: Number(form.deathYear),
        sourceAttribution: form.sourceAttribution || undefined,
        translationNotes: form.translationNotes || undefined,
        provenanceNotes: form.provenanceNotes || undefined,
      }, controller.signal)

      if (bridgeCode !== 0) {
        setLog(prev => prev + '\n[stopped — bridge step did not exit cleanly, skipping import]\n')
        setFailed(true)
        return
      }

      setLog(prev => prev + '\n\n— Step 2/2: running pipeline-import.mjs (imports every staged prospect) —\n\n')
      const importCode = await streamStep('/api/admin/pipeline/run', { action: 'import' }, controller.signal)

      if (importCode !== 0) {
        setLog(prev => prev + '\n[import step did not exit cleanly]\n')
        setFailed(true)
        return
      }

      setLog(prev => prev + '\n[done — check the log above for this bundle\'s outcome; "rejected" means the copyright re-check failed]\n')
      setDone(true)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setLog(prev => prev + `\n[client error] ${(err as Error).message}\n`)
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center overflow-auto z-20 p-6" onClick={running ? undefined : onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 my-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-stone-800">Bridge &amp; import · {bundle.title || bundle.slug}</h3>
          {!running && <button onClick={onClose} className="text-sm text-stone-400 hover:text-stone-800">Close</button>}
        </div>
        <p className="text-xs text-stone-400 mb-4">
          Runs <code>stage-to-output.mjs</code> (writes <code>scripts/ingestion/output/{bundle.slug}/</code> + a{' '}
          <code>staged</code> queue entry), then <code>pipeline-import.mjs</code> — which imports{' '}
          <span className="font-medium">every</span> staged prospect in the queue, not just this one, and re-verifies
          copyright before inserting anything. Texts land in Drafts as <span className="font-medium">unpublished</span>.
        </p>

        {!log && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shape">
                <select className={inputCls} value={form.by} onChange={e => set({ by: e.target.value as 'single' | 'book' })}>
                  <option value="single">single (one text)</option>
                  <option value="book">book (split at literal &quot;# … Book N&quot; headings)</option>
                </select>
                <span className="text-[11px] text-stone-400 mt-0.5 block">
                  &quot;book&quot; only works if body.md has real <code>#</code>-level &quot;Book N&quot; headings — check the
                  Review panel first (some bundles use different heading text, or none at all).
                </span>
              </Field>
              <Field label="genre">
                <select className={inputCls} value={form.genre} onChange={e => set({ genre: e.target.value })}>
                  <option value="">—</option>{GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="author"><input className={inputCls} value={form.author} onChange={e => set({ author: e.target.value })} /></Field>
              <Field label="title"><input className={inputCls} value={form.title} onChange={e => set({ title: e.target.value })} /></Field>
              <Field label="tradition (required)">
                <select className={inputCls} value={form.tradition} onChange={e => set({ tradition: e.target.value })}>
                  <option value="">—</option>{TRADITIONS.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="era">
                <select className={inputCls} value={form.era} onChange={e => set({ era: e.target.value })}>
                  <option value="">—</option>{ERAS.map(e => <option key={e.slug} value={e.slug}>{e.label}</option>)}
                </select>
              </Field>
              <Field label="author death year (required — HARD CONSTRAINT 3)">
                <input className={inputCls} type="number" value={form.deathYear} onChange={e => set({ deathYear: e.target.value })} placeholder="e.g. 604" />
              </Field>
            </div>

            <div className="mt-3">
              <span className="text-xs text-stone-500">themes <span className="text-stone-400">({form.themes.length}/{MAX_THEMES})</span></span>
              <ThemePicker themes={form.themes} onToggle={toggleTheme} grouped />
            </div>

            <div className="mt-3">
              <Field label="source attribution (optional — see the bundle's provenance.yml)">
                <input className={inputCls} value={form.sourceAttribution} onChange={e => set({ sourceAttribution: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="translation notes (optional)">
                <textarea className={`${inputCls} mt-0.5`} rows={2} value={form.translationNotes} onChange={e => set({ translationNotes: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="provenance notes (optional)">
                <textarea className={`${inputCls} mt-0.5`} rows={2} value={form.provenanceNotes} onChange={e => set({ provenanceNotes: e.target.value })} />
              </Field>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={onClose} className="text-sm text-stone-500 hover:text-stone-800">Cancel</button>
              <button onClick={run} disabled={!canSubmit} className="text-sm px-3 py-1.5 rounded bg-stone-800 text-white hover:bg-stone-700 disabled:opacity-40">
                Bridge &amp; import
              </button>
            </div>
          </>
        )}

        {log && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-stone-600">
                {running ? 'Running…' : done ? 'Done' : failed ? 'Stopped' : ''}
              </span>
              {running && <button onClick={() => abortRef.current?.abort()} className="text-xs text-red-600 hover:underline">Stop</button>}
            </div>
            <pre className="text-xs text-stone-700 bg-stone-50 p-3 overflow-auto max-h-96 whitespace-pre-wrap border border-stone-100 rounded">{log}</pre>
            <div className="flex justify-end gap-3 mt-4">
              {!running && (done || failed) && (
                <a href="/admin/pipeline" className="text-sm text-stone-500 hover:text-stone-800 self-center">Check queue status →</a>
              )}
              {!running && (
                <button onClick={onDone} className="text-sm px-3 py-1.5 rounded bg-stone-800 text-white hover:bg-stone-700">
                  Close
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
