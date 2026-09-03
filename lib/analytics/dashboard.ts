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

// A headline growth metric with its previous-period value for a delta.
export type Kpi = {
  key: string
  label: string
  value: number
  prev: number | null // previous equivalent period, or null if not reported
  higherIsBetter: boolean
  format: 'int' | 'pct' | 'ratio' | 'duration'
  hero?: boolean
  note?: string
}

export type DashboardWindow = { startAt: number; endAt: number }

// The read-only client returned by createUmamiClient. Its `.get` is attached by
// mutation in the untyped .mjs, so TS can't infer it from the return value —
// pin the shape here.
type UmamiClient = {
  mode: string
  get: (path: string, params?: Record<string, unknown>) => Promise<unknown>
}

// mode says which selector is active; month is set (YYYY-MM) only in month mode.
export type SelectionMode = 'range' | 'month'

export type DashboardData =
  | {
      ok: true
      mode: SelectionMode
      range: Range
      month: string | null
      label: string
      window: DashboardWindow
      stats: Stats
      kpis: Kpi[]
      repeatRate: number
      landingPages: Ranked[] // top entry pages, slug-enriched
      landingByType: Ranked[] // entry pages rolled up by page type
      referrers: Ranked[]
      digest: Digest
      eventCounts: EventCount[]
      umamiMode: string
      growthNotes: string[] // soft warnings (e.g. a metric the share token refused)
    }
  | {
      ok: false
      mode: SelectionMode
      range: Range
      month: string | null
      label: string
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

// ── Growth KPIs ───────────────────────────────────────────────────────────

function num(x: unknown): number {
  if (typeof x === 'number') return x
  if (x && typeof x === 'object' && 'value' in x) return Number((x as { value: unknown }).value) || 0
  return Number(x) || 0
}

// Umami /stats returns current-period totals plus a `comparison` object with the
// previous equivalent period. From those we derive the growth headline —
// including "repeat visits" (visits − visitors), the closest proxy the read-only
// stats endpoint gives for The Stromata's returning-visits North Star. It is
// repeat *visits*, not unique returning *visitors* (Umami's stats endpoint
// doesn't split those) — labelled as such, not dressed up as more.
function buildKpis(stats: Record<string, unknown>): { kpis: Kpi[]; repeatRate: number } {
  const cmp =
    stats && typeof stats.comparison === 'object' && stats.comparison
      ? (stats.comparison as Record<string, unknown>)
      : null
  const g = (k: string) => num(stats?.[k])
  const p = (k: string) => (cmp ? num(cmp[k]) : null)

  const visitors = g('visitors')
  const visits = g('visits')
  const pageviews = g('pageviews')
  const bounces = g('bounces')
  const totaltime = g('totaltime')

  const repeat = Math.max(0, visits - visitors)
  const pVisitors = p('visitors')
  const pVisits = p('visits')
  const pRepeat = pVisitors != null && pVisits != null ? Math.max(0, pVisits - pVisitors) : null
  const repeatRate = visits > 0 ? repeat / visits : 0

  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0)
  const pRatio = (ak: string, bk: string) => {
    const a = p(ak)
    const b = p(bk)
    return a != null && b != null && b > 0 ? a / b : null
  }

  const kpis: Kpi[] = [
    { key: 'repeat', label: 'Repeat visits', value: repeat, prev: pRepeat, higherIsBetter: true, format: 'int', hero: true, note: `${(repeatRate * 100).toFixed(0)}% of visits — North Star` },
    { key: 'visitors', label: 'Visitors', value: visitors, prev: pVisitors, higherIsBetter: true, format: 'int' },
    { key: 'visits', label: 'Visits', value: visits, prev: pVisits, higherIsBetter: true, format: 'int' },
    { key: 'pageviews', label: 'Pageviews', value: pageviews, prev: p('pageviews'), higherIsBetter: true, format: 'int' },
    { key: 'perVisit', label: 'Views / visit', value: ratio(pageviews, visits), prev: pRatio('pageviews', 'visits'), higherIsBetter: true, format: 'ratio' },
    { key: 'bounce', label: 'Bounce rate', value: ratio(bounces, visits), prev: pRatio('bounces', 'visits'), higherIsBetter: false, format: 'pct' },
    { key: 'duration', label: 'Avg visit', value: ratio(totaltime, visits), prev: pRatio('totaltime', 'visits'), higherIsBetter: true, format: 'duration' },
  ]
  return { kpis, repeatRate }
}

// ── Landing pages (entry-page paths -> page type + enriched label) ──────────

const PAGE_TYPE: [RegExp, string][] = [
  [/^\/texts\//, 'Text'],
  [/^\/collections\//, 'Collection'],
  [/^\/authors?\b/, 'Author'],
  [/^\/locations?\//, 'Location'],
  [/^\/themes?\//, 'Theme'],
  [/^\/eras?\//, 'Era'],
  [/^\/traditions?\//, 'Tradition'],
]
function pageType(path: string): string {
  if (path === '/' || path === '' || path === '(none)') return 'Home'
  for (const [re, name] of PAGE_TYPE) if (re.test(path)) return name
  return 'Other'
}
function enrichPath(path: string, db: Awaited<ReturnType<typeof loadCorpus>>): string {
  const t = /^\/texts\/([^/?#]+)/.exec(path)
  if (t) {
    const x = db.textsBySlug.get(t[1])
    if (x) return `${x.title}  ·  text`
  }
  const c = /^\/collections\/([^/?#]+)/.exec(path)
  if (c) {
    const x = db.collectionsBySlug.get(c[1])
    if (x) return `${x.name}  ·  collection`
  }
  if (path === '/' || path === '' || path === '(none)') return 'Home (/)'
  return path
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function normaliseRange(raw: string | undefined | null): Range {
  const r = (raw || '30d') as Range
  return RANGES.includes(r) || r === 'today' ? r : '30d'
}

// ── Calendar-month selection ────────────────────────────────────────────────
// A month is just a specific window, so it flows through the same data path as
// the presets. Boundaries are UTC (month-granularity; the ~1h London offset is
// immaterial here). Umami's `comparison` for a ~month window is the preceding
// equal-length span, so deltas read as "vs the previous period".

export type MonthOption = { value: string; label: string }
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthToWindow(month: string | null | undefined): DashboardWindow | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month || '')
  if (!m) return null
  const year = Number(m[1])
  const mon = Number(m[2])
  if (mon < 1 || mon > 12) return null
  const startAt = Date.UTC(year, mon - 1, 1)
  const endAt = Date.UTC(year, mon, 1) - 1 // last ms of the month
  return { startAt, endAt }
}

export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : month
}

// The last `count` calendar months, newest first, for the month selector.
export function recentMonths(count = 12, now = new Date()): MonthOption[] {
  const y = now.getUTCFullYear()
  const mo = now.getUTCMonth()
  const out: MonthOption[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, mo - i, 1))
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    out.push({ value, label: `${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}` })
  }
  return out
}

/**
 * Fetch Umami + Supabase and build the demand digest for the given range.
 * Never throws — Umami may be blocked (ad-blockers, Keith's own network) or
 * unreachable in CI/build; on any failure this returns { ok: false, error }
 * so the page can render a notice instead of 500-ing.
 */
const RANGE_LABELS: Record<Range, string> = {
  '24h': 'Last 24 hours',
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
}

export type Selection = { range?: string | null; month?: string | null }

export async function getDashboardData(selection: Selection): Promise<DashboardData> {
  const monthWin = monthToWindow(selection.month)
  const mode: SelectionMode = monthWin ? 'month' : 'range'
  const range = normaliseRange(selection.range)
  const month = mode === 'month' ? selection.month! : null
  const label = mode === 'month' ? monthLabel(month!) : RANGE_LABELS[range]
  const base = { mode, range, month, label }
  try {
    const win = monthWin ?? rangeToWindow(range)
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

    // Growth extras — fetched tolerantly: a share token that refuses `entry` or
    // `referrer` degrades just that panel, never the whole page.
    const [entryRes, referrerRes] = await Promise.allSettled([
      umami.get('websites/{id}/metrics', { ...rangeParams, type: 'entry', limit: 25 }),
      umami.get('websites/{id}/metrics', { ...rangeParams, type: 'referrer', limit: 20 }),
    ])
    const growthNotes: string[] = []

    let landingPages: Ranked[] = []
    let landingByType: Ranked[] = []
    if (entryRes.status === 'fulfilled') {
      const entries = rows(entryRes.value, 'path')
      landingPages = entries
        .map((e) => ({ label: enrichPath(e.path, db), value: e.count }))
        .sort((a, b) => b.value - a.value)
      const byType = new Map<string, number>()
      for (const e of entries) byType.set(pageType(e.path), (byType.get(pageType(e.path)) || 0) + e.count)
      landingByType = [...byType.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
    } else {
      growthNotes.push('Landing pages (entry metric) unavailable for this share token.')
    }

    let referrers: Ranked[] = []
    if (referrerRes.status === 'fulfilled') {
      referrers = rows(referrerRes.value, 'label')
        .map((r) => ({ label: r.label && r.label !== '(none)' ? r.label : '(direct / none)', value: r.count }))
        .sort((a, b) => b.value - a.value)
    } else {
      growthNotes.push('Referrers unavailable for this share token.')
    }

    const { kpis, repeatRate } = buildKpis((stats ?? {}) as Record<string, unknown>)

    return {
      ok: true,
      ...base,
      window: { startAt: win.startAt, endAt: win.endAt },
      stats: (stats ?? {}) as Stats,
      kpis,
      repeatRate,
      landingPages,
      landingByType,
      referrers,
      digest,
      eventCounts,
      umamiMode: umami.mode,
      growthNotes,
    }
  } catch (err) {
    return { ok: false, ...base, error: err instanceof Error ? err.message : String(err) }
  }
}
