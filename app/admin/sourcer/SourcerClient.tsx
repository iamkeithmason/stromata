'use client'

import { useState } from 'react'
import type { StagedBundleSummary } from '@/lib/sourcer/staging'

const inputColClass = 'text-xs px-2 py-0.5 rounded border'

export default function SourcerClient({ bundles }: { bundles: StagedBundleSummary[] }) {
  const [open, setOpen] = useState<{ slug: string; title: string; files: { name: string; content: string }[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  async function viewBundle(b: StagedBundleSummary) {
    setError(null)
    setLoading(b.slug)
    try {
      const res = await fetch(`/api/admin/sourcer/bundle?slug=${encodeURIComponent(b.slug)}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to read bundle'); return }
      setOpen({ slug: b.slug, title: b.title || b.slug, files: json.files })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

      <div className="border border-stone-200 rounded divide-y divide-stone-100">
        {bundles.length === 0 && (
          <p className="px-4 py-6 text-sm text-stone-400">
            No staged bundles right now. The Sourcer opens a draft PR with new ones once a month (or on demand); once
            merged to <code>main</code>, they show up here.
          </p>
        )}
        {bundles.map(b => (
          <div key={b.slug} className="px-4 py-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-stone-800 text-sm font-medium truncate">{b.title || b.slug}</span>
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
              </p>
              {b.themes.length > 0 && (
                <p className="text-stone-400 text-xs mt-1">{b.themes.join(', ')}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 text-xs">
              <button
                onClick={() => viewBundle(b)}
                disabled={loading === b.slug}
                className={`${inputColClass} border-stone-300 text-stone-700 hover:border-stone-500 disabled:opacity-40`}
              >
                {loading === b.slug ? 'Loading…' : 'Review'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {open && <BundlePanel bundle={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function BundlePanel({
  bundle, onClose,
}: {
  bundle: { slug: string; title: string; files: { name: string; content: string }[] }
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

        <p className="text-xs text-stone-400 mb-3">
          Read-only — nothing here is published or in the database. To confirm or edit the proposed genre / themes /
          collection structure, hand-edit <code>content/staging/{bundle.slug}/metadata.yml</code> (see{' '}
          <code>scripts/sourcer/README.md</code> for the bridge into the normal import path).
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
