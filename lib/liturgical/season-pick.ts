import { cache } from 'react'
import { createPublicClient } from '@/lib/supabase/public'
import type { Season } from './year'

/**
 * The season's pick: one text per liturgical season, chosen by hand.
 *
 * Shared by the seasonal panel and, on phones, the homepage hero, which both
 * name the pick. The lookup is wrapped in React's `cache`, so one render of the
 * homepage asks Supabase once however many places show the pick.
 */

export type SeasonPick = {
  title: string
  author: string
  href: string
  /** Optional author portrait for the arch; falls back to the initial when unset. */
  imageUrl?: string | null
}

/** The author columns the arch needs: portrait plus its stored framing. */
type AuthorPortrait = {
  image_url: string | null
  image_focus_x: number | null
  image_focus_y: number | null
  image_zoom: number | null
}

export type LiveSeasonPick = SeasonPick & {
  /** The text's slug, for analytics (derived from href so it can't drift). */
  slug: string
  imageUrl: string | null
  focusX: number | null
  focusY: number | null
  zoom: number | null
}

// ── The picks — one text per season, chosen by hand ──────────────────────────
//   This is the editorial layer and it stays human: the corpus carries almost
//   no season-marked texts (a title scan over 207 published texts returns
//   essentially nothing), so season-fit is a curator's judgement, not a query.
//   Set an entry as its text is chosen; `null` is a designed state, not a gap.
// ────────────────────────────────────────────────────────────────────────────
export const SEASON_PICKS: Record<Season, SeasonPick | null> = {
  advent: null,
  christmas: { title: 'Sermon 21 (On the Feast of the Nativity)', author: 'Leo the Great', href: '/texts/sermon-21-on-the-feast-of-the-nativity' },
  epiphany: null,
  lent: null,
  eastertide: null,
  trinitytide: { title: 'A Short Rule of Life', author: 'John Wycliffe', href: '/texts/a-short-rule-of-life' },
}

/**
 * The season's pick, if it is set AND its text is published; otherwise null.
 *
 * One query does two jobs: it confirms the pick's text is actually published,
 * and it brings back the author's portrait and stored framing (focal point +
 * zoom, migration 017) so the panel crops the same way the author band does.
 *
 * The published check matters because a pick can be set for a season months
 * ahead of the text leaving /admin/drafts, as the Christmastide pick was.
 * Rather than link the homepage at a page that isn't there, an unpublished or
 * missing pick reads as no pick, and each caller shows its designed no-pick state.
 */
export const getLiveSeasonPick = cache(async (season: Season): Promise<LiveSeasonPick | null> => {
  const configured = SEASON_PICKS[season]
  const slug = configured?.href.split('/').filter(Boolean).pop()
  if (!configured || !slug) return null

  const supabase = createPublicClient()
  const { data } = await supabase
    .from('texts')
    .select('id, author:authors(image_url, image_focus_x, image_focus_y, image_zoom)')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()
  if (!data?.id) return null

  const author = data.author as unknown as AuthorPortrait | null
  return {
    ...configured,
    slug,
    imageUrl: configured.imageUrl ?? author?.image_url ?? null,
    focusX: author?.image_focus_x ?? null,
    focusY: author?.image_focus_y ?? null,
    zoom: author?.image_zoom ?? null,
  }
})
