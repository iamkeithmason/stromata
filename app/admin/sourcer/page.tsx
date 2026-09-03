import Link from 'next/link'
import { listStagedBundles } from '@/lib/sourcer/staging'
import SourcerClient from './SourcerClient'

export const dynamic = 'force-dynamic'

export default async function SourcerPage() {
  const bundles = await listStagedBundles()

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
        published or in the database. Getting a reviewed bundle into{' '}
        <Link href="/admin/drafts" className="underline hover:text-stone-700">Drafts</Link> still needs the manual
        bridge step (<code>scripts/sourcer/stage-to-output.mjs</code> → <code>scripts/pipeline-import.mjs</code>)
        described in each bundle&rsquo;s SOURCER.md.
      </p>

      <SourcerClient bundles={bundles} />
    </main>
  )
}
