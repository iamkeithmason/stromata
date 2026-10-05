import Link from 'next/link'
import { TenMinutesList, type ListText } from './TenMinutesList'
import { createPublicClient } from '@/lib/supabase/public'
import { orThrow } from '@/lib/supabase/query'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import {
  MIN_WORDS,
  TEN_MINUTES,
  rankTenMinuteTexts,
  themeChoices,
  type TenMinuteText,
} from '@/lib/ten-minutes'

// Weekly, like the other public pages; publishing refreshes it through
// lib/publishing/publish-text.ts (textPaths). Static on purpose — the theme
// choice is client state in TenMinutesList, not a searchParam.
export const revalidate = 604800

export const metadata = {
  title: 'I have ten minutes — The Stromata',
  description:
    'A short text for a short sitting: a handful of public-domain Christian writings that can be read in ten minutes or less.',
  alternates: { canonical: '/ten-minutes' },
}

type Row = TenMinuteText & {
  author: { name: string; slug: string | null } | null
  genre: { name: string } | null
}

// ~2,000 words is the ten-minute ceiling at the site's 200 wpm (lib/reading-time).
const MAX_WORDS = TEN_MINUTES * 200

export default async function TenMinutesPage() {
  const supabase = createPublicClient()

  const rows = orThrow(
    await supabase
      .from('texts')
      .select(`
        id, title, slug, word_count, summary, editorial_introduction,
        author:authors(name, slug),
        genre:genres(name),
        text_themes(theme:themes(name, slug))
      `)
      .eq('published', true)
      .gte('word_count', MIN_WORDS)
      .lte('word_count', MAX_WORDS),
    'the ten-minutes page',
  )

  const ranked = rankTenMinuteTexts((rows ?? []) as unknown as Row[])
  const choices = themeChoices(ranked)
  const list: ListText[] = ranked.map(t => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    word_count: t.word_count,
    summary: t.summary,
    editorial_introduction: t.editorial_introduction,
    text_themes: t.text_themes,
    authorName: t.author?.name ?? null,
    genreName: t.genre?.name ?? null,
  }))

  return (
    <div className="page-vellum min-h-screen" style={{ paddingTop: '4rem' }}>
      <SiteHeader breadcrumb={null} />

      <main id="main-content" className="content-shell py-12">
        <div className="mb-10">
          <p className="kicker mb-3">A short sitting</p>
          <h1 className="font-serif text-3xl mb-3" style={{ color: 'var(--ink)' }}>
            I have ten minutes
          </h1>
          <p className="font-serif leading-relaxed" style={{ color: 'var(--ink-soft)', maxWidth: 'var(--reading-measure)' }}>
            Each of these can be read in ten minutes or less. Pick one and begin; the rest of the
            library is a click away when you want more.
          </p>
        </div>

        <TenMinutesList texts={list} choices={choices} />

        <p className="mt-12">
          <Link
            href="/texts"
            className="kicker transition-opacity hover:opacity-70"
            style={{ textDecoration: 'none' }}
            data-umami-event="ten-minutes-continue"
            data-umami-event-from="ten-minutes"
          >
            Browse the whole library →
          </Link>
        </p>
      </main>
      <TrackPageEvent event="ten-minutes-view" />
    </div>
  )
}
