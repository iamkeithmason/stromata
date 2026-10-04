import Link from 'next/link'
import { SiteHeader } from '@/app/components/SiteHeader'
import { createPublicClient } from '@/lib/supabase/public'
import { displayBookName } from '@/lib/scripture'
import ScriptureSearch from './ScriptureSearch'

export const metadata = {
  title: 'Scripture — The Stromata',
  description:
    'Look up a Bible verse to see which texts in The Stromata cite it — a scriptural index across the whole library.',
  alternates: { canonical: '/scripture' },
}

// Incremental Static Regeneration: cache the rendered page and revalidate
// weekly so "Most cited" stays fresh without a per-request Supabase hit. Given
// the manual publish cadence, a week-stale index is an acceptable trade for
// serving this page from cache.
export const revalidate = 604800

type CountRow = {
  osis: string
  book: string
  chapter: number
  verse_start: number | null
  verse_end: number | null
  text_count: number
}

function referenceLabel(row: CountRow): string {
  const name = displayBookName(row.book)
  if (row.verse_start == null) return `${name} ${row.chapter}`
  if (row.verse_end == null || row.verse_end === row.verse_start) return `${name} ${row.chapter}:${row.verse_start}`
  return `${name} ${row.chapter}:${row.verse_start}-${row.verse_end}`
}

export default async function ScriptureIndexPage() {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('scripture_reference_counts')
    .select('osis, book, chapter, verse_start, verse_end, text_count')
    .order('text_count', { ascending: false })
    .order('book')
    .limit(12)
  const mostCited = (data ?? []) as CountRow[]

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader breadcrumb={null} />

      <main id="main-content" className="content-shell py-12">
        <div className="mb-6">
          <h1 className="font-serif text-3xl mb-3" style={{ color: '#1b1b1b' }}>Scripture</h1>
          <p className="font-serif leading-relaxed" style={{ color: '#1b1b1b' }}>
            Look up a verse to see which texts in the library cite it. Enter a reference such as
            {' '}<span style={{ fontStyle: 'italic' }}>John 3:16</span> or{' '}
            <span style={{ fontStyle: 'italic' }}>Rom. 8:28</span>.
          </p>
        </div>

        <div className="mb-12">
          <ScriptureSearch />
        </div>

        {mostCited.length > 0 && (
          <div>
            <div className="mb-6">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-base" style={{ color: '#1b1b1b' }}>Most cited</h2>
                <span className="smallcaps" style={{ color: '#6f6a60' }}>
                  across the library
                </span>
              </div>
              <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
            </div>

            <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
              {mostCited.map(row => {
                const label = referenceLabel(row)
                return (
                  <li key={row.osis}>
                    <Link
                      href={`/scripture/${encodeURIComponent(label)}`}
                      className="flex items-baseline justify-between py-3 group"
                    >
                      <span className="font-serif group-hover:opacity-70 transition-opacity" style={{ color: '#1b1b1b' }}>
                        {label}
                      </span>
                      <span className="text-xs ml-4 shrink-0" style={{ color: '#6f6a60' }}>
                        {row.text_count} {row.text_count === 1 ? 'text' : 'texts'}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}
