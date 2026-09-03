import Link from 'next/link'
import { listStagedBundles } from '@/lib/sourcer/staging'
import { resolveLiveStatuses } from '@/lib/pipeline/liveStatus'
import SourcerClient from './SourcerClient'

export const dynamic = 'force-dynamic'

export default async function SourcerPage() {
  const bundles = await listStagedBundles()
  const isDev = process.env.NODE_ENV !== 'production'

  // Only an "imported" bundle can possibly be live — checking the rest would
  // just be wasted Supabase round-trips.
  const liveStatuses = await resolveLiveStatuses(
    bundles.filter(b => b.bridgeStatus === 'imported').map(b => b.slug)
  )
  const bundlesWithLiveStatus = bundles.map(b => {
    const live = liveStatuses.get(b.slug)
    return { ...b, liveStatus: live?.status ?? ('unknown' as const), liveHref: live?.href ?? null }
  })

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">← Admin</Link>
      </div>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-semibold text-stone-800">Sourcer bundles</h2>
      </div>
      <p className="text-xs text-stone-400 mb-6">
        Draft bundles the Sourcer staged under <code>content/staging/</code> for editorial review — nothing here is
        published or in the database until you bridge &amp; import a bundle below, which lands it in{' '}
        <Link href="/admin/drafts" className="underline hover:text-stone-700">Drafts</Link> as{' '}
        <span className="font-medium">unpublished</span>.
      </p>

      {!isDev && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-6">
          The bridge &amp; import runner is disabled outside local development. You can still review bundles here.
        </p>
      )}

      <SourcerClient bundles={bundlesWithLiveStatus} isDev={isDev} />
    </main>
  )
}
