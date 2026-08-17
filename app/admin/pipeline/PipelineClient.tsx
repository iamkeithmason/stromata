'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import {
  TRADITIONS, ERAS, GENRES, THEME_CLUSTERS, ALL_THEMES, MAX_THEMES, SOURCE_TYPES, STATUSES,
} from '@/lib/pipeline/vocab'

type RunAction = 'fetch' | 'extract' | 'import'

type Prospect = {
  id: string
  status: string
  added?: string
  author?: string
  death_year?: number | null
  tradition?: string
  era?: string
  title?: string
  genre?: string
  source_type?: string
  source_url?: string
  collection_slug?: string
  translation_copyright_clear?: boolean
  translator?: string
  translator_death_year?: number | null
  docx_path?: string
  stage_1_notes?: string
  stage_2_output?: string
  stage_3_themes?: string[]
  rejection_reason?: string
  notes?: string
  _actions?: RunAction[]
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-stone-100 text-stone-600 border-stone-200',
  'stage-1-done': 'bg-blue-50 text-blue-700 border-blue-200',
  'stage-2-done': 'bg-blue-50 text-blue-700 border-blue-200',
  'stage-3-done': 'bg-blue-50 text-blue-700 border-blue-200',
  staged: 'bg-amber-50 text-amber-700 border-amber-200',
  imported: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
}

const EMPTY: Prospect = {
  id: '', status: 'pending', author: '', title: '', source_type: 'archive_online',
  tradition: '', era: '', genre: '', source_url: '', collection_slug: '',
  translator: '', docx_path: '', notes: '', translation_copyright_clear: false,
}

export default function PipelineClient({
  initialProspects, runLogs, isDev,
}: {
  initialProspects: Prospect[]
  runLogs: string[]
  isDev: boolean
}) {
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects)
  const [filter, setFilter] = useState<string>('all')
  const [form, setForm] = useState<Prospect | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // run log
  const [log, setLog] = useState<string>('')
  const [running, setRunning] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // output review
  const [output, setOutput] = useState<{ slug: string; files: { name: string; content: string }[] } | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of prospects) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [prospects])

  const visible = useMemo(
    () => (filter === 'all' ? prospects : prospects.filter(p => p.status === filter)),
    [prospects, filter]
  )
  const stagedCount = counts['staged'] ?? 0

  const refreshQueue = useCallback(async () => {
    const res = await fetch('/api/admin/pipeline/queue')
    if (res.ok) setProspects((await res.json()).prospects)
  }, [])

  async function saveProspect() {
    if (!form) return
    setSaving(true)
    setError(null)
    const res = await fetch('/api/admin/pipeline/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (!res.ok) {
      setError((await res.json()).error ?? 'Save failed')
      return
    }
    setForm(null)
    refreshQueue()
  }

  async function rejectProspect(p: Prospect) {
    const reason = window.prompt(`Reject "${p.title || p.id}" — reason?`, p.rejection_reason || '')
    if (reason === null) return
    const res = await fetch('/api/admin/pipeline/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, action: 'reject', reason }),
    })
    if (res.ok) refreshQueue()
    else setError((await res.json()).error ?? 'Reject failed')
  }

  async function run(action: RunAction, prospectId?: string) {
    setError(null)
    setLog('')
    setRunning(`${action}:${prospectId ?? 'all'}`)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch('/api/admin/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, prospectId }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        setLog((await res.json().then(j => j.error).catch(() => 'Run failed')) as string)
        setRunning(null)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        setLog(prev => prev + decoder.decode(value, { stream: true }))
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setLog(prev => prev + `\n[client error] ${(err as Error).message}\n`)
    } finally {
      setRunning(null)
      abortRef.current = null
      refreshQueue()
    }
  }

  async function viewOutput(p: Prospect) {
    const slug = p.collection_slug || p.id
    setError(null)
    const res = await fetch(`/api/admin/pipeline/output?slug=${encodeURIComponent(slug)}`)
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Failed to read output')
      return
    }
    if (!json.files?.length) {
      setError(`No staged output found for "${slug}".`)
      return
    }
    setOutput({ slug, files: json.files })
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <FilterChip label="all" active={filter === 'all'} count={prospects.length} onClick={() => setFilter('all')} />
          {STATUSES.map(s => (
            <FilterChip key={s} label={s} active={filter === s} count={counts[s] ?? 0} onClick={() => setFilter(s)} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {isDev && (
            <button
              onClick={() => run('import')}
              disabled={!!running || stagedCount === 0}
              className="text-sm px-3 py-1.5 rounded bg-stone-800 text-white hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title={stagedCount === 0 ? 'No staged prospects to import' : `Import ${stagedCount} staged prospect(s)`}
            >
              {running === 'import:all' ? 'Importing…' : `Run import (${stagedCount} staged)`}
            </button>
          )}
          <button
            onClick={() => { setForm({ ...EMPTY }); setError(null) }}
            className="text-sm px-3 py-1.5 rounded border border-stone-300 text-stone-700 hover:border-stone-500"
          >
            + New prospect
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-stone-200 rounded divide-y divide-stone-100">
        {visible.length === 0 && <p className="px-4 py-6 text-sm text-stone-400">No prospects in this view.</p>}
        {visible.map(p => (
          <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLOR[p.status] ?? 'bg-stone-100 text-stone-600 border-stone-200'}`}>
                  {p.status}
                </span>
                <span className="text-stone-800 text-sm font-medium truncate">{p.title || p.id}</span>
              </div>
              <p className="text-stone-400 text-xs mt-1">
                {p.author || 'Unknown author'}
                {p.genre ? ` · ${p.genre}` : ''}
                {p.source_type ? ` · ${p.source_type}` : ''}
                {p.stage_3_themes?.length ? ` · ${p.stage_3_themes.join(', ')}` : ''}
              </p>
              {p.status === 'rejected' && p.rejection_reason && (
                <p className="text-red-500 text-xs mt-1">✕ {p.rejection_reason}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 text-xs">
              {isDev && p._actions?.includes('fetch') && (
                <ActionBtn label="Fetch" busy={running === `fetch:${p.id}`} disabled={!!running} onClick={() => run('fetch', p.id)} />
              )}
              {isDev && p._actions?.includes('extract') && (
                <ActionBtn label="Extract" busy={running === `extract:${p.id}`} disabled={!!running} onClick={() => run('extract', p.id)} />
              )}
              <button onClick={() => viewOutput(p)} className="text-stone-500 hover:text-stone-900">Output</button>
              <button onClick={() => { setForm({ ...EMPTY, ...p }); setError(null) }} className="text-stone-500 hover:text-stone-900">Edit</button>
              {p.status !== 'rejected' && (
                <button onClick={() => rejectProspect(p)} className="text-stone-400 hover:text-red-600">Reject</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Run log */}
      {(log || running) && (
        <div className="border border-stone-200 rounded">
          <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100">
            <span className="text-xs font-medium text-stone-600">Run output {running && <span className="text-stone-400">· running…</span>}</span>
            <div className="flex gap-3">
              {running && <button onClick={() => abortRef.current?.abort()} className="text-xs text-red-600 hover:underline">Stop</button>}
              {!running && <button onClick={() => setLog('')} className="text-xs text-stone-400 hover:text-stone-700">Clear</button>}
            </div>
          </div>
          <pre className="text-xs text-stone-700 bg-stone-50 p-3 overflow-auto max-h-80 whitespace-pre-wrap">{log || '…'}</pre>
        </div>
      )}

      {/* Run logs list */}
      {runLogs.length > 0 && (
        <div className="text-xs text-stone-400">
          Recent run logs: {runLogs.slice(0, 8).map(f => f.replace('.md', '')).join(' · ')}
        </div>
      )}

      {form && (
        <ProspectForm
          form={form}
          setForm={setForm as (p: Prospect) => void}
          onSave={saveProspect}
          onCancel={() => { setForm(null); setError(null) }}
          saving={saving}
        />
      )}

      {output && <OutputPanel output={output} onClose={() => setOutput(null)} onSaved={c => setOutput(c)} onError={setError} />}
    </div>
  )
}

function FilterChip({ label, active, count, onClick }: { label: string; active: boolean; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded border ${active ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'}`}
    >
      {label} <span className={active ? 'text-stone-300' : 'text-stone-400'}>{count}</span>
    </button>
  )
}

function ActionBtn({ label, busy, disabled, onClick }: { label: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} className="px-2 py-0.5 rounded border border-stone-300 text-stone-700 hover:border-stone-500 disabled:opacity-40 disabled:cursor-not-allowed">
      {busy ? `${label}…` : label}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-stone-500">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  )
}

const inputCls = 'w-full text-sm border border-stone-300 rounded px-2 py-1 focus:outline-none focus:border-stone-500'

function ProspectForm({
  form, setForm, onSave, onCancel, saving,
}: {
  form: Prospect
  setForm: (p: Prospect) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const set = (patch: Partial<Prospect>) => setForm({ ...form, ...patch })
  const themes = form.stage_3_themes ?? []
  const toggleTheme = (t: string) => {
    if (themes.includes(t)) set({ stage_3_themes: themes.filter(x => x !== t) })
    else if (themes.length < MAX_THEMES) set({ stage_3_themes: [...themes, t] })
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center overflow-auto z-20 p-6" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 my-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-stone-800 mb-4">{form.id ? 'Edit prospect' : 'New prospect'}</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="id (kebab-case slug)"><input className={inputCls} value={form.id} onChange={e => set({ id: e.target.value })} placeholder="small-catechism-luther" /></Field>
          <Field label="collection_slug"><input className={inputCls} value={form.collection_slug ?? ''} onChange={e => set({ collection_slug: e.target.value })} /></Field>
          <Field label="title"><input className={inputCls} value={form.title ?? ''} onChange={e => set({ title: e.target.value })} /></Field>
          <Field label="author"><input className={inputCls} value={form.author ?? ''} onChange={e => set({ author: e.target.value })} /></Field>
          <Field label="death_year"><input className={inputCls} type="number" value={form.death_year ?? ''} onChange={e => set({ death_year: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="status">
            <select className={inputCls} value={form.status} onChange={e => set({ status: e.target.value })}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="tradition">
            <select className={inputCls} value={form.tradition ?? ''} onChange={e => set({ tradition: e.target.value })}>
              <option value="">—</option>
              {TRADITIONS.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="era">
            <select className={inputCls} value={form.era ?? ''} onChange={e => set({ era: e.target.value })}>
              <option value="">—</option>
              {ERAS.map(e => <option key={e.slug} value={e.slug}>{e.label}</option>)}
            </select>
          </Field>
          <Field label="genre">
            <select className={inputCls} value={form.genre ?? ''} onChange={e => set({ genre: e.target.value })}>
              <option value="">—</option>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="source_type">
            <select className={inputCls} value={form.source_type ?? ''} onChange={e => set({ source_type: e.target.value })}>
              {SOURCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="source_url"><input className={inputCls} value={form.source_url ?? ''} onChange={e => set({ source_url: e.target.value })} /></Field>
          <Field label="translator"><input className={inputCls} value={form.translator ?? ''} onChange={e => set({ translator: e.target.value })} /></Field>
          <Field label="translator_death_year"><input className={inputCls} type="number" value={form.translator_death_year ?? ''} onChange={e => set({ translator_death_year: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="docx_path (gdrive_docx only)"><input className={inputCls} value={form.docx_path ?? ''} onChange={e => set({ docx_path: e.target.value })} placeholder="/Users/…/file.docx" /></Field>
        </div>

        <label className="flex items-center gap-2 mt-3 text-xs text-stone-600">
          <input type="checkbox" checked={!!form.translation_copyright_clear} onChange={e => set({ translation_copyright_clear: e.target.checked })} />
          translation_copyright_clear
        </label>

        <div className="mt-3">
          <span className="text-xs text-stone-500">notes</span>
          <textarea className={`${inputCls} mt-0.5`} rows={2} value={form.notes ?? ''} onChange={e => set({ notes: e.target.value })} />
        </div>

        <div className="mt-4">
          <span className="text-xs text-stone-500">themes <span className="text-stone-400">({themes.length}/{MAX_THEMES})</span></span>
          <div className="mt-1 space-y-2">
            {Object.entries(THEME_CLUSTERS).map(([cluster, list]) => (
              <div key={cluster}>
                <div className="text-[11px] uppercase tracking-wide text-stone-400">{cluster}</div>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {list.map(t => {
                    const on = themes.includes(t)
                    const full = !on && themes.length >= MAX_THEMES
                    return (
                      <button key={t} onClick={() => toggleTheme(t)} disabled={full}
                        className={`text-xs px-1.5 py-0.5 rounded border ${on ? 'bg-stone-800 text-white border-stone-800' : full ? 'text-stone-300 border-stone-100' : 'text-stone-600 border-stone-200 hover:border-stone-400'}`}>
                        {t}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} className="text-sm text-stone-500 hover:text-stone-800">Cancel</button>
          <button onClick={onSave} disabled={saving || !form.id} className="text-sm px-3 py-1.5 rounded bg-stone-800 text-white hover:bg-stone-700 disabled:opacity-40">
            {saving ? 'Saving…' : 'Save prospect'}
          </button>
        </div>
      </div>
    </div>
  )
}

function OutputPanel({
  output, onClose, onSaved, onError,
}: {
  output: { slug: string; files: { name: string; content: string }[] }
  onClose: () => void
  onSaved: (o: { slug: string; files: { name: string; content: string }[] }) => void
  onError: (e: string) => void
}) {
  const [active, setActive] = useState(0)
  const file = output.files[active]
  const fm = useMemo(() => parseFrontmatter(file.content), [file.content])
  const [genre, setGenre] = useState(fm.genre ?? '')
  const [tradition, setTradition] = useState(fm.tradition ?? '')
  const [era, setEra] = useState(fm.era ?? '')
  const [themes, setThemes] = useState<string[]>(fm.themes ?? [])
  const [savingFm, setSavingFm] = useState(false)

  const selectFile = (i: number) => {
    setActive(i)
    const f = parseFrontmatter(output.files[i].content)
    setGenre(f.genre ?? ''); setTradition(f.tradition ?? ''); setEra(f.era ?? ''); setThemes(f.themes ?? [])
  }

  const toggleTheme = (t: string) => {
    if (themes.includes(t)) setThemes(themes.filter(x => x !== t))
    else if (themes.length < MAX_THEMES) setThemes([...themes, t])
  }

  async function saveFm() {
    setSavingFm(true)
    const res = await fetch('/api/admin/pipeline/output', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: file.name, genre, tradition, era, themes }),
    })
    setSavingFm(false)
    const json = await res.json()
    if (!res.ok) { onError(json.error ?? 'Save failed'); return }
    const files = output.files.map((f, i) => (i === active ? { ...f, content: json.content } : f))
    onSaved({ ...output, files })
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center overflow-auto z-20 p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6 my-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-stone-800">Staged output · {output.slug}</h3>
          <button onClick={onClose} className="text-sm text-stone-400 hover:text-stone-800">Close</button>
        </div>

        {output.files.length > 1 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {output.files.map((f, i) => (
              <button key={f.name} onClick={() => selectFile(i)} className={`text-xs px-2 py-0.5 rounded border ${i === active ? 'bg-stone-800 text-white border-stone-800' : 'text-stone-600 border-stone-200 hover:border-stone-400'}`}>
                {f.name.split('/').pop()}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-3">
          <Field label="genre">
            <select className={inputCls} value={genre} onChange={e => setGenre(e.target.value)}>
              <option value="">—</option>{GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="tradition">
            <select className={inputCls} value={tradition} onChange={e => setTradition(e.target.value)}>
              <option value="">—</option>{TRADITIONS.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="era">
            <select className={inputCls} value={era} onChange={e => setEra(e.target.value)}>
              <option value="">—</option>{ERAS.map(e => <option key={e.slug} value={e.slug}>{e.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="mb-3">
          <span className="text-xs text-stone-500">themes <span className="text-stone-400">({themes.length}/{MAX_THEMES})</span></span>
          <div className="flex flex-wrap gap-1 mt-1">
            {ALL_THEMES.map(t => {
              const on = themes.includes(t)
              const full = !on && themes.length >= MAX_THEMES
              return (
                <button key={t} onClick={() => toggleTheme(t)} disabled={full}
                  className={`text-xs px-1.5 py-0.5 rounded border ${on ? 'bg-stone-800 text-white border-stone-800' : full ? 'text-stone-300 border-stone-100' : 'text-stone-600 border-stone-200 hover:border-stone-400'}`}>
                  {t}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex justify-end mb-4">
          <button onClick={saveFm} disabled={savingFm} className="text-sm px-3 py-1.5 rounded bg-stone-800 text-white hover:bg-stone-700 disabled:opacity-40">
            {savingFm ? 'Saving…' : 'Save frontmatter'}
          </button>
        </div>

        <pre className="text-xs text-stone-700 bg-stone-50 border border-stone-100 rounded p-3 overflow-auto max-h-96 whitespace-pre-wrap">{file.content}</pre>
      </div>
    </div>
  )
}

// Minimal frontmatter reader for the editable fields.
function parseFrontmatter(content: string): { genre?: string; tradition?: string; era?: string; themes?: string[] } {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return {}
  const out: { genre?: string; tradition?: string; era?: string; themes?: string[] } = {}
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '---') break
    const scalar = line.match(/^(genre|tradition|era):\s*"?([^"#]*?)"?\s*(#.*)?$/)
    if (scalar) { (out as Record<string, string>)[scalar[1]] = scalar[2].trim(); continue }
    const inlineThemes = line.match(/^themes:\s*\[([^\]]*)\]/)
    if (inlineThemes) {
      out.themes = inlineThemes[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean)
      continue
    }
    if (line.match(/^themes:\s*$/)) {
      const list: string[] = []
      let j = i + 1
      while (j < lines.length && lines[j].match(/^\s*-\s/)) { list.push(lines[j].replace(/^\s*-\s*/, '').replace(/['"]/g, '').trim()); j++ }
      out.themes = list
    }
  }
  return out
}
