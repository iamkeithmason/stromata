import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'

export const metadata = {
  title: 'Locations — The Stromata',
  description:
    'Browse the authors of The Stromata by the places they lived and worked — a geography of Christian writing across the centuries.',
  alternates: { canonical: '/locations' },
}

export default async function LocationsPage() {
  const supabase = createServerClient()

  const [{ data: locations }, { data: authorCounts }] = await Promise.all([
    supabase.from('locations').select('id, name, slug').order('name'),
    supabase.from('authors').select('location_id').not('location_id', 'is', null).not('slug', 'is', null).eq('draft', false),
  ])

  const countMap: Record<number, number> = {}
  for (const a of authorCounts ?? []) {
    if (a.location_id) countMap[a.location_id] = (countMap[a.location_id] ?? 0) + 1
  }

  const entries = (locations ?? []).filter(l => countMap[l.id] > 0)

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader />

      <main className="content-shell py-12">
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h1 className="font-serif italic text-xl" style={{ color: '#1b1b1b' }}>Locations</h1>
            <span className="text-xs tracking-[0.18em] uppercase" style={{ color: '#6f6a60' }}>
              {entries.length} {entries.length === 1 ? 'country' : 'countries'}
            </span>
          </div>
          <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
        </div>

        {entries.length > 0 ? (
          <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
            {entries.map(loc => (
              <li key={loc.id}>
                <Link
                  href={`/locations/${loc.slug}`}
                  className="flex items-baseline justify-between py-4 group"
                  data-umami-event="location-country-click"
                  data-umami-event-from="locations-index"
                  data-umami-event-country={loc.name}
                >
                  <span className="font-serif group-hover:opacity-70 transition-opacity" style={{ color: '#1b1b1b' }}>
                    {loc.name}
                  </span>
                  <span className="text-xs ml-4 shrink-0" style={{ color: '#6f6a60' }}>
                    {countMap[loc.id]} {countMap[loc.id] === 1 ? 'author' : 'authors'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: '#6f6a60' }}>No location data yet.</p>
        )}
      </main>
      <TrackPageEvent event="location-page-view" />
    </div>
  )
}
