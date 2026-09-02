// Server-only analytics data module for /admin/analytics.
//
// Umami records events keyed by SLUG; Supabase knows what the slugs mean. This
// fetches the same Umami series the CLI digest fetches (scripts/analytics/digest.mjs),
// loads the Supabase corpus, and joins them via buildDigest — rolling reader
// demand up by theme / author / era / tradition / genre, the view Umami cannot
// produce on its own.
//
// NEVER import from a Client Component: this reads server-only env (the Umami
// share token and the Supabase service-role key) and must stay on the server.
// Read-only throughout — GET to Umami, SELECT to Supabase.

import { createClient } from '@supabase/supabase-js'
// Reused, unmodified, from the analytics CLI. These are untyped .mjs modules,
// so their exports arrive as `any` — the shapes are pinned by the types below.
import { createUmamiClient, rangeToWindow } from '@/scripts/lib/umami.mjs'
import { buildDigest } from '@/scripts/analytics/aggregate.mjs'

// ── Public types ────────────────────────────────────────────────────────────

export type Range = '24h' | 'today' | '7d' | '30d' | '90d' | 'all'
export const RANGES: Range[] = ['24h', '7d', '30d', '90d', 'all']

export type Ranked = { label: string; value: number }
export type TopText = { slug: string; count: number; title: string; author: string; themes: string[] }
export type Collection = { slug: string; count: number; name: string }
export type Unmatched = { slug: string; count: number }
export type EventCount = { key: string; count: number }

export type Digest = {
  topTexts: TopText[]
  byTheme: Ranked[]
  byAuthor: Ranked[]
  byEra: Ranked[]
  byTradition: Ranked[]
  byGenre: Ranked[]
  collections: Collection[]
  fromAttribution: Ranked[]
  unmatchedTexts: Unmatched[]
  unmatchedCollections: Unmatched[]
  totals: {
    totalTextOpens: number
    matchedOpens: number
    unmatchedOpens: number
    distinctTextsOpened: number
  }
}

export type Stats = Record<string, number | { value: number } | undefined>

export type DashboardWindow = { startAt: number; endAt: number }

// The read-only client returned by createUmamiClient. Its `.get` is attached by
// mutation in the untyped .mjs, so TS can't infer it from the return value —
// pin the shape here.
type UmamiClient = {
  mode: string
  get: (path: string, params?: Record<string, unknown>) => Promise<unknown>
}

export type DashboardData =
  | {
      ok: true
      range: Range
      window: DashboardWindow
      stats: Stats
      digest: Digest
      eventCounts: EventCount[]
      umamiMode: string
    }
  | {
      ok: false
      range: Range
      error: string
    }

// ── Helpers ─────────────────────────────────────────────────────────────────

// event-data/values and metrics rows -> { key, count } (mirrors digest.mjs).
type UmamiRow = { value?: string; x?: string; name?: string; total?: number; y?: number; count?: number }
function rows<K extends string>(data: unknown, keyName: K): (Record<K, string> & { count: number })[] {
  const arr = Array.isArray(data) ? (data as UmamiRow[]) : []
  return arr.map((r) => ({
    [keyName]: r.value ?? r.x ?? r.name ?? '(none)',
    count: r.total ?? r.y ?? r.count ?? 0,
  })) as (Record<K, string> & { count: number })[]
}

// Same cred chain as digest.mjs: ANALYTICS_SUPABASE_* → SCOUT_SUPABASE_* →
// NEXT_PUBLIC_SUPABASE_URL + SERVICE_ROLE/anon. A service-role or dedicated
// read role is needed — RLS hides authors/texts from the anon key.
function supabaseClient() {
  const url = (
    process.env.ANALYTICS_SUPABASE_URL ||
    process.env.SCOUT_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  )
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, '')
  const key =
    process.env.ANALYTICS_SUPABASE_KEY ||
    process.env.SCOUT_SUPABASE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase credentials missing. Set ANALYTICS_SUPABASE_URL + ANALYTICS_SUPABASE_KEY ' +
        '(or SCOUT_SUPABASE_*, or NEXT_PUBLIC_SUPABASE_URL + a read key). A service-role or ' +
        'dedicated read role is needed — RLS hides authors/texts from the anon key.'
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

type SbText = { id: string; slug: string; title: string; author_id: string | null; genre_id: string | null }
type SbAuthor = { id: string; name: string; tradition_id: string | null; era_id: string | null }

async function loadCorpus(sb: ReturnType<typeof supabaseClient>) {
  const [texts, authors, traditions, eras, genres, themes, textThemes, collections] = await Promise.all([
    sb.from('texts').select('id, slug, title, author_id, genre_id'),
    sb.from('authors').select('id, name, tradition_id, era_id'),
    sb.from('traditions').select('id, name'),
    sb.from('eras').select('id, label'),
    sb.from('genres').select('id, name'),
    sb.from('themes').select('id, name'),
    sb.from('text_themes').select('text_id, theme_id'),
    sb.from('collections').select('slug, title'),
  ])
  const results = { texts, authors, traditions, eras, genres, themes, textThemes, collections }
  for (const [label, res] of Object.entries(results)) {
    if (res.error) throw new Error(`Supabase read failed for ${label}: ${res.error.message}`)
  }

  const themeNameById = new Map<string, string>(
    ((themes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  )
  const themesByTextId = new Map<string, string[]>()
  for (const { text_id, theme_id } of (textThemes.data ?? []) as { text_id: string; theme_id: string }[]) {
    const name = themeNameById.get(theme_id)
    if (!name) continue
    if (!themesByTextId.has(text_id)) themesByTextId.set(text_id, [])
    themesByTextId.get(text_id)!.push(name)
  }

  return {
    textsBySlug: new Map(((texts.data ?? []) as SbText[]).map((t) => [t.slug, t])),
    authorsById: new Map(((authors.data ?? []) as SbAuthor[]).map((a) => [a.id, a])),
    traditionsById: new Map(((traditions.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])),
    erasById: new Map(((eras.data ?? []) as { id: string; label: string }[]).map((e) => [e.id, e.label])),
    genresById: new Map(((genres.data ?? []) as { id: string; name: string }[]).map((g) => [g.id, g.name])),
    themesByTextId,
    // aggregate/render use `.name` as the display label; collections store `title`.
    collectionsBySlug: new Map(
      ((collections.data ?? []) as { slug: string; title: string }[]).map((c) => [c.slug, { name: c.title }])
    ),
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function normaliseRange(raw: string | undefined | null): Range {
  const r = (raw || '30d') as Range
  return RANGES.includes(r) || r === 'today' ? r : '30d'
}

/**
 * Fetch Umami + Supabase and build the demand digest for the given range.
 * Never throws — Umami may be blocked (ad-blockers, Keith's own network) or
 * unreachable in CI/build; on any failure this returns { ok: false, error }
 * so the page can render a notice instead of 500-ing.
 */
export async function getDashboardData(rawRange: string | undefined | null): Promise<DashboardData> {
  const range = normaliseRange(rawRange)
  try {
    const win = rangeToWindow(range)
    if (!win) throw new Error(`Unknown range "${range}".`)
    const rangeParams = { startAt: win.startAt, endAt: win.endAt }

    const umami = (await createUmamiClient(process.env)) as unknown as UmamiClient
    const [stats, textVals, collectionVals, fromVals, eventMetrics] = await Promise.all([
      umami.get('websites/{id}/stats', rangeParams),
      umami.get('websites/{id}/event-data/values', { ...rangeParams, eventName: 'text-open', propertyName: 'text' }),
      umami.get('websites/{id}/event-data/values', { ...rangeParams, eventName: 'collection-open', propertyName: 'collection' }),
      umami.get('websites/{id}/event-data/values', { ...rangeParams, eventName: 'text-open', propertyName: 'from' }),
      umami.get('websites/{id}/metrics', { ...rangeParams, type: 'event', limit: 100 }),
    ])

    const db = await loadCorpus(supabaseClient())
    const digest = buildDigest({
      textOpens: rows(textVals, 'slug').map((r) => ({ slug: r.slug, count: r.count })),
      collectionOpens: rows(collectionVals, 'slug').map((r) => ({ slug: r.slug, count: r.count })),
      fromAttribution: rows(fromVals, 'surface').map((r) => ({ surface: r.surface, count: r.count })),
      db,
    }) as Digest

    const eventCounts = rows(eventMetrics, 'key').sort((a, b) => b.count - a.count)

    return {
      ok: true,
      range,
      window: { startAt: win.startAt, endAt: win.endAt },
      stats: (stats ?? {}) as Stats,
      digest,
      eventCounts,
      umamiMode: umami.mode,
    }
  } catch (err) {
    return { ok: false, range, error: err instanceof Error ? err.message : String(err) }
  }
}
