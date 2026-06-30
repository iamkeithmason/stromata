import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

type DraftRow = {
  id: string
  title: string
  slug: string
  note_draft: string | null
  editorial_introduction: string | null
  created_at: string
  author: { name: string; draft: boolean } | null
  genre: { name: string } | null
  text_themes: { theme: { name: string } | null }[]
}

export default async function AdminDraftsPage() {
  const supabase = createServerClient()

  const { data: drafts } = await supabase
    .from('texts')
    .select(
      'id, title, slug, note_draft, editorial_introduction, created_at, author:authors(name, draft), genre:genres(name), text_themes(theme:themes(name))'
    )
    .eq('published', false)
    .order('created_at', { ascending: false })

  const rows = (drafts ?? []) as unknown as DraftRow[]

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">← Admin</Link>
      </div>

      <div className="space-y-8">
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-stone-800">
                Drafts <span className="text-stone-400 font-normal text-sm">({rows.length})</span>
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Unpublished texts awaiting review — most from the content pipeline. Review and publish from the text edit form.
              </p>
            </div>
            <Link href="/admin/texts/new" className="text-sm text-stone-600 hover:text-stone-900">
              + Add text
            </Link>
          </div>

          {rows.length > 0 ? (
            <div className="border border-stone-200 rounded divide-y divide-stone-100">
              {rows.map(t => {
                const themes = t.text_themes.map(tt => tt.theme?.name).filter(Boolean)
                const hasNoteDraft = !!t.note_draft
                const hasEditorialIntro = !!t.editorial_introduction
                return (
                  <div key={t.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-stone-800 text-sm font-medium">{t.title}</span>
                          {t.author?.draft && (
                            <span className="text-xs font-medium text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                              Author draft
                            </span>
                          )}
                        </div>
                        <p className="text-stone-400 text-xs mt-1">
                          {t.author?.name ?? 'Unknown author'}
                          {t.genre?.name ? ` · ${t.genre.name}` : ''}
                          {themes.length > 0 ? ` · ${(themes as string[]).join(', ')}` : ''}
                        </p>
                        {hasNoteDraft && (
                          <p className="text-stone-500 text-xs mt-2 leading-relaxed line-clamp-2">
                            {t.note_draft}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className={hasNoteDraft ? 'text-green-600' : 'text-amber-500'}>
                            {hasNoteDraft ? '● draft note' : '○ no draft note'}
                          </span>
                          <span className="text-stone-300">·</span>
                          <span className={hasEditorialIntro ? 'text-green-600' : 'text-amber-500'}>
                            {hasEditorialIntro ? '● intro written' : '○ no intro'}
                          </span>
                        </div>
                        <Link href={`/admin/texts/${t.id}/edit`} className="text-xs text-stone-500 hover:text-stone-900">
                          Review →
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-stone-400">No drafts — everything is published.</p>
          )}
        </section>
      </div>
    </main>
  )
}
