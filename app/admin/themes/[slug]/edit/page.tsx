import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import EditThemeForm from './EditThemeForm'

type Props = { params: Promise<{ slug: string }> }

export default async function EditThemePage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: theme } = await supabase
    .from('themes')
    .select('id, slug, name, plain_language_subtitle')
    .eq('slug', slug)
    .single()

  if (!theme) notFound()

  return (
    <main>
      <div className="mb-8">
        <Link href="/admin/themes" className="text-sm text-stone-500 hover:text-stone-700">
          ← Themes
        </Link>
      </div>

      <h1 className="text-2xl font-serif text-stone-800 mb-8">Edit theme</h1>

      <EditThemeForm
        slug={theme.slug}
        name={theme.name}
        initialSubtitle={theme.plain_language_subtitle ?? ''}
      />
    </main>
  )
}
