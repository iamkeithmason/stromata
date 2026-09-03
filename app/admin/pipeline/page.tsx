import Link from 'next/link'
import { promises as fs } from 'fs'
import path from 'path'
import { readQueue } from '@/lib/pipeline/queue'
import { availableActions } from '@/lib/pipeline/runner'
import { hasOutput } from '@/lib/pipeline/outputs'
import { resolveLiveStatuses } from '@/lib/pipeline/liveStatus'
import PipelineClient from './PipelineClient'

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const queue = await readQueue()

  // Only an "imported" prospect can possibly be live — checking the rest
  // would just be wasted Supabase round-trips. Batched to 2 queries total.
  const liveStatuses = await resolveLiveStatuses(
    queue.prospects.filter(p => p.status === 'imported').map(p => p.collection_slug || p.id)
  )

  const prospects = await Promise.all(
    queue.prospects.map(async p => {
      const live = liveStatuses.get(p.collection_slug || p.id)
      return {
        ...p,
        _actions: availableActions(p),
        _hasOutput: await hasOutput(p.collection_slug || p.id),
        _liveStatus: live?.status ?? ('unknown' as const),
        _liveHref: live?.href ?? null,
      }
    })
  )

  // Recent run-log filenames, newest first.
  let runLogs: string[] = []
  try {
    const dir = path.join(process.cwd(), 'scripts', 'ingestion', 'run-log')
    runLogs = (await fs.readdir(dir)).filter(f => f.endsWith('.md')).sort().reverse()
  } catch {
    /* no run-log dir yet */
  }

  const isDev = process.env.NODE_ENV !== 'production'

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">← Admin</Link>
      </div>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-semibold text-stone-800">Content pipeline</h2>
      </div>
      <p className="text-xs text-stone-400 mb-6">
        Manage the prospect queue and run ingestion stages. Import writes texts as{' '}
        <span className="font-medium">unpublished drafts</span> — review and publish from{' '}
        <Link href="/admin/drafts" className="underline hover:text-stone-700">Drafts</Link>.
      </p>

      {!isDev && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-6">
          Script runners are disabled outside local development. You can still view and edit the queue here.
        </p>
      )}

      <PipelineClient initialProspects={prospects} runLogs={runLogs} isDev={isDev} />
    </main>
  )
}
