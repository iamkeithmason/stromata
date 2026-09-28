import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { THEME_CLUSTERS } from '@/lib/constants'

type ThemeRow = {
  id: number
  slug: string
  name: string
  cluster: string
  plain_language_subtitle: string | null
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

export default async function AdminThemesPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = createServerClient()

  const { data: themes } = await supabase
    .from('themes')
    .select('id, slug, name, cluster, plain_language_subtitle')

  const bySlug = new Map((themes as unknown as ThemeRow[] ?? []).map(t => [t.slug, t]))

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">← Admin</Link>
      </div>

      <div className="space-y-8">
        {params.success === 'theme' && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Theme saved successfully.
          </p>
        )}

        {THEME_CLUSTERS.map(cluster => (
          <section key={cluster.cluster}>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-lg font-semibold text-stone-800">{cluster.cluster}</h2>
            </div>

            <div className="border border-stone-200 rounded divide-y divide-stone-100">
              {cluster.themes.map(t => {
                const theme = bySlug.get(t.slug)
                return (
                  <div key={t.slug} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-stone-800 text-sm font-medium">{t.name}</span>
                        {theme?.plain_language_subtitle && (
                          <span className="text-stone-400 text-xs ml-3">
                            {theme.plain_language_subtitle.length > 80
                              ? theme.plain_language_subtitle.slice(0, 80) + '…'
                              : theme.plain_language_subtitle}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <Dot filled={!!theme?.plain_language_subtitle} emptyLabel="No plain-language subtitle" />
                        <Link href={`/admin/themes/${t.slug}/edit`} className="text-xs text-stone-500 hover:text-stone-900">
                          Edit
                        </Link>
                        <Link href={`/themes/${t.slug}`} target="_blank" className="text-xs text-stone-400 hover:text-stone-700">
                          View →
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
