import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { readQueue } from '@/lib/pipeline/queue'
import { listStagedBundles } from '@/lib/sourcer/staging'
import { resolveLiveStatuses } from '@/lib/pipeline/liveStatus'
import AgentSchedule from './AgentSchedule'

type TextRow = {
  id: string; title: string; slug: string; published: boolean; editorial_introduction: string | null
  author: { id: string; name: string; slug: string | null; draft: boolean }[]
  genre: { name: string }[]
  collection: { id: string; title: string; slug: string; published: boolean } | null
}
type CollectionRow = {
  id: string; title: string; slug: string; published: boolean; description: string | null
  author: { name: string } | null
}

function Dot({ filled, emptyLabel }: { filled: boolean; emptyLabel: string }) {
  return (
    <span className="relative group inline-flex items-center cursor-help">
      <span className={filled ? 'text-green-500' : 'text-amber-400'} style={{ fontSize: '0.5rem', lineHeight: 1 }}>●</span>
      {!filled && (
        <span className="absolute bottom-full right-0 mb-1.5 px-2 py-1 text-xs bg-stone-800 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
          {emptyLabel}
        </span>
      )}
    </span>
  )
}

type Props = { searchParams: Promise<{ success?: string }> }

export default async function AdminDashboard({ searchParams }: Props) {
  const params = await searchParams
  const supabase = createServerClient()

  const [
    { data: texts },
    { data: collections },
    { count: authorCount },
    { count: locationCount },
    { count: eraCount },
    { count: traditionCount },
    { count: draftCount },
  ] = await Promise.all([
    supabase
      .from('texts')
      .select('id, title, slug, published, editorial_introduction, author:authors(id, name, slug, draft), genre:genres(name), collection:collections(id, title, slug, published)')
      .order('created_at', { ascending: false }),
    supabase
      .from('collections')
      .select('id, title, slug, published, description, author:authors(name)')
      .order('title'),
    supabase.from('authors').select('id', { count: 'exact', head: true }),
    supabase.from('locations').select('id', { count: 'exact', head: true }),
    supabase.from('eras').select('id', { count: 'exact', head: true }),
    supabase.from('traditions').select('id', { count: 'exact', head: true }),
    supabase.from('texts').select('id', { count: 'exact', head: true }).eq('published', false),
  ])

  // Count pending pipeline prospects for the Pipeline nav card.
  let pendingCount = 0
  try {
    const queue = await readQueue()
    pendingCount = queue.prospects.filter(p => p.status === 'pending').length
  } catch {
    /* queue file unreadable — show 0 */
  }

  // Count active (not yet live) staged Sourcer bundles for the Sourcer nav card
  // — one that's already published has nothing left to do, so it shouldn't
  // keep inflating this count forever.
  let sourcerCount = 0
  try {
    const bundles = await listStagedBundles()
    const liveStatuses = await resolveLiveStatuses(
      bundles.filter(b => b.bridgeStatus === 'imported').map(b => b.slug)
    )
    sourcerCount = bundles.filter(b => liveStatuses.get(b.slug)?.status !== 'live').length
  } catch {
    /* content/staging or Supabase unreadable — show 0 */
  }

  // ── Integrity alerts ──────────────────────────────────────────────────────
  // A published text whose author or collection is still hidden is a
  // half-published state. The public pages now degrade gracefully (the author
  // page renders bio-less, the collection link falls back to a standalone text
  // — see app/authors and app/page/texts/themes), so it's no longer a hard 404,
  // but it's almost always an oversight worth finishing. Surface it here.
  //  • draft author  → author has live works but no public bio / not in the index
  //  • draft (unpublished) collection → collection hidden; text shows on its own
  const allTexts = (texts ?? []) as unknown as TextRow[]
  const liveTextDraftAuthor = allTexts.filter(t => t.published && t.author?.[0]?.draft)
  const liveTextDraftCollection = allTexts.filter(t => t.published && t.collection && t.collection.published === false)
  const integrityCount = liveTextDraftAuthor.length + liveTextDraftCollection.length

  return (
    <main>
      <div className="space-y-12">

        {params.success === 'text' && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Text saved successfully.
          </p>
        )}
        {params.success === 'collection' && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Collection saved successfully.
          </p>
        )}

        {/* Integrity alerts — dead links a visitor can hit right now */}
        {integrityCount > 0 && (
          <section className="border border-amber-300 bg-amber-50 rounded px-4 py-3">
            <h2 className="text-sm font-semibold text-amber-800 mb-2">
              Needs attention <span className="font-normal">({integrityCount})</span>
            </h2>

            {liveTextDraftAuthor.length > 0 && (
              <div className="mb-3 last:mb-0">
                <p className="text-xs text-amber-800 mb-1.5">
                  Published {liveTextDraftAuthor.length === 1 ? 'text has' : 'texts have'} an author still marked
                  draft — the author page shows no bio and is hidden from the Authors index until you promote them:
                </p>
                <ul className="space-y-1">
                  {liveTextDraftAuthor.map(t => {
                    const a = t.author[0]
                    return (
                      <li key={t.id} className="text-xs text-stone-700 flex flex-wrap items-center gap-x-2">
                        <Link href={`/admin/texts/${t.id}/edit`} className="font-medium hover:text-stone-900">{t.title}</Link>
                        <span className="text-stone-400">— author</span>
                        <span className="italic">{a.name}</span>
                        <Link href={`/admin/authors/${a.id}/edit`} className="text-amber-700 hover:text-amber-900 underline">
                          promote author →
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {liveTextDraftCollection.length > 0 && (
              <div className="mb-3 last:mb-0">
                <p className="text-xs text-amber-800 mb-1.5">
                  Published {liveTextDraftCollection.length === 1 ? 'text is' : 'texts are'} in a collection still
                  marked draft — the collection is hidden from the site; publish it, or the text stands on its own:
                </p>
                <ul className="space-y-1">
                  {liveTextDraftCollection.map(t => (
                    <li key={t.id} className="text-xs text-stone-700 flex flex-wrap items-center gap-x-2">
                      <Link href={`/admin/texts/${t.id}/edit`} className="font-medium hover:text-stone-900">{t.title}</Link>
                      <span className="text-stone-400">— collection</span>
                      <span className="italic">{t.collection!.title}</span>
                      <Link href={`/admin/collections/${t.collection!.id}/edit`} className="text-amber-700 hover:text-amber-900 underline">
                        edit collection →
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Nav cards */}
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Pipeline', href: '/admin/pipeline', count: pendingCount ?? 0 },
              { label: 'Sourcer', href: '/admin/sourcer', count: sourcerCount ?? 0 },
              { label: 'Analytics', href: '/admin/analytics', count: '→' as number | string },
              { label: 'Drafts', href: '/admin/drafts', count: draftCount ?? 0 },
              { label: 'Authors', href: '/admin/authors', count: authorCount ?? 0 },
              { label: 'Traditions', href: '/admin/traditions', count: traditionCount ?? 0 },
              { label: 'Eras', href: '/admin/eras', count: eraCount ?? 0 },
              { label: 'Locations', href: '/admin/locations', count: locationCount ?? 0 },
            ].map(({ label, href, count }) => (
              <Link
                key={href}
                href={href}
                className="border border-stone-200 rounded px-4 py-3 hover:border-stone-400 transition-colors"
              >
                <div className="text-xs text-stone-400 uppercase tracking-wide mb-1">{label}</div>
                <div className="text-lg font-semibold text-stone-800">{count}</div>
              </Link>
            ))}
          </div>
          <AgentSchedule />
        </div>

        {/* Collections */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-800">
              Collections <span className="text-stone-400 font-normal text-sm">({collections?.length ?? 0})</span>
            </h2>
            <Link href="/admin/collections/new" className="text-sm text-stone-600 hover:text-stone-900">
              + Add collection
            </Link>
          </div>
          {collections && collections.length > 0 ? (
            <div className="border border-stone-200 rounded divide-y divide-stone-100">
              {(collections as unknown as CollectionRow[]).map((c: CollectionRow) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="text-stone-800 text-sm font-medium">{c.title}</span>
                    <span className="text-stone-400 text-xs ml-3">
                      {(c.author as { name: string } | null)?.name}
                    </span>
                    <span className={`ml-3 text-xs ${c.published ? 'text-green-600' : 'text-stone-400'}`}>
                      {c.published ? '● Published' : '○ Draft'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Dot filled={!!c.description} emptyLabel="No description" />
                    <Link href={`/admin/collections/${c.id}/edit`} className="text-xs text-stone-500 hover:text-stone-900">
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400">No collections yet.</p>
          )}
        </section>

        {/* Texts */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-800">
              Texts <span className="text-stone-400 font-normal text-sm">({texts?.length ?? 0})</span>
            </h2>
            <Link href="/admin/texts/new" className="text-sm text-stone-600 hover:text-stone-900">
              + Add text
            </Link>
          </div>
          {texts && texts.length > 0 ? (
            <div className="border border-stone-200 rounded divide-y divide-stone-100">
              {(texts as unknown as TextRow[]).map((t: TextRow) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="text-stone-800 text-sm font-medium">{t.title}</span>
                    <span className="text-stone-400 text-xs ml-3">
                      {(t.author as unknown as { name: string }[])?.[0]?.name} · {(t.genre as unknown as { name: string }[])?.[0]?.name}
                      {(t.collection as { title: string } | null)?.title && (
                        <> · <span className="italic">{(t.collection as { title: string }).title}</span></>
                      )}
                    </span>
                    <span className={`ml-3 text-xs ${t.published ? 'text-green-600' : 'text-stone-400'}`}>
                      {t.published ? '● Published' : '○ Draft'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Dot filled={!!t.editorial_introduction} emptyLabel="No editorial introduction" />
                    <Link href={`/admin/texts/new?from=${t.id}`} className="text-xs text-stone-400 hover:text-stone-700">
                      Duplicate
                    </Link>
                    <Link href={`/admin/texts/${t.id}/edit`} className="text-xs text-stone-500 hover:text-stone-900">
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400">No texts yet.</p>
          )}
        </section>

      </div>
    </main>
  )
}
