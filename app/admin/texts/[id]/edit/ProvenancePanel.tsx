import { buildProvenancePanel, type PanelInput } from '@/lib/review/provenance-panel'

const STATUS_LABEL = {
  ok: 'Provenance complete',
  incomplete: 'Provenance incomplete',
  unsafe: 'Provenance unsafe or unconfirmed',
} as const

const STATUS_CLASS = {
  ok: 'border-emerald-300 bg-emerald-50',
  incomplete: 'border-amber-300 bg-amber-50',
  unsafe: 'border-red-400 bg-red-50',
} as const

export default function ProvenancePanel(props: PanelInput) {
  const model = buildProvenancePanel(props)
  return (
    <section className={`mb-8 rounded border p-4 ${STATUS_CLASS[model.status]}`} aria-label="Source and provenance">
      <h2 className="text-sm font-semibold text-stone-800 mb-3">Source &amp; provenance — {STATUS_LABEL[model.status]}</h2>
      {model.flags.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm">
          {model.flags.map(f => (
            <li key={f.message} className={f.severity === 'unsafe' ? 'font-semibold text-red-800' : 'text-stone-800'}>
              {f.severity === 'unsafe' ? '⚠ ' : f.severity === 'missing' ? '○ ' : '· '}
              {f.message}
            </li>
          ))}
        </ul>
      )}
      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1 text-sm">
        {model.rows.map(r => (
          <div key={r.label} className="contents">
            <dt className="text-stone-500">{r.label}</dt>
            <dd className={r.value ? 'text-stone-800 break-words' : 'text-red-700'}>{r.value ?? 'Missing'}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-stone-500">Advisory only: it does not block publishing. Edit the fields in the form below.</p>
    </section>
  )
}
