import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { sameSections } from '@/scripts/lib/sections.mjs'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Sections · Review queue' }

type SectionsDoc = { source: 'editorial'; sections: { label: string; starts_with: string }[] }

type Row = {
  id: string
  title: string
  slug: string
  sections_draft: SectionsDoc | null
  sections: SectionsDoc | null
  author: { name: string } | null
}

/**
 * The sections queue: long texts without headings that have a drafted set of
 * editor's sections waiting for Keith. Metadata only — each text's body is
 * read on its own page, never all of them here (33 bodies would be ~3.4 MB of
 * Supabase egress on every visit; see "Supabase limits" in CLAUDE.md).
 */
export default async function SectionsQueuePage() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('texts')
    .select('id, title, slug, sections_draft, sections, author:authors(name)')
    .not('sections_draft', 'is', null)
    .order('title')

  const rows = (data ?? []) as unknown as Row[]
  const pending = rows.filter(r => !sameSections(r.sections_draft, r.sections))
  const approved = rows.filter(r => sameSections(r.sections_draft, r.sections))

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin/review" className="text-xs text-stone-400 hover:text-stone-700">← Review queue</Link>
      </div>

      <h1 className="text-lg font-semibold text-stone-800">Sections</h1>
      <p className="text-sm text-stone-500 mt-1">
        Editor&apos;s sections for long texts with no headings. They give a reader a contents list,
        and they are marked as not part of the original text.
      </p>
      <p className="text-sm text-stone-500 mt-2">
        {pending.length} to review · {approved.length} approved
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-stone-400 mt-8">
          No drafts yet. Run <code>npm run generate:review-drafts -- --sections</code>.
        </p>
      ) : (
        <>
          <List rows={pending} label="To review" />
          <List rows={approved} label="Approved" muted />
        </>
      )}
    </main>
  )
}

function List({ rows, label, muted = false }: { rows: Row[]; label: string; muted?: boolean }) {
  if (rows.length === 0) return null
  return (
    <section className="mt-6">
      <h2 className="text-xs uppercase tracking-wide text-stone-400 mb-2">{label}</h2>
      <ul className="space-y-2">
        {rows.map(r => (
          <li key={r.id}>
            <Link
              href={`/admin/review/sections/${r.slug}`}
              className={`block border rounded p-4 active:bg-stone-100 hover:border-stone-400 transition-colors ${
                muted ? 'border-stone-200 text-stone-500' : 'border-stone-300 text-stone-800'
              }`}
            >
              <span className="font-medium leading-snug">{r.title}</span>
              <p className="text-xs text-stone-400 mt-1">
                {r.author?.name ?? 'Unknown'} · {r.sections_draft?.sections.length ?? 0} sections
                {r.sections && !sameSections(r.sections_draft, r.sections) && (
                  <span className="text-amber-600"> · edited since approval</span>
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
