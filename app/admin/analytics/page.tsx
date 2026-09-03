import Link from 'next/link'
import {
  getDashboardData,
  recentMonths,
  RANGES,
  type Range,
  type Ranked,
  type Kpi,
  type SelectionMode,
} from '@/lib/analytics/dashboard'

// Live data — never statically cached; the numbers change and the fetch can fail.
export const dynamic = 'force-dynamic'

const RANGE_LABEL: Record<Range, string> = {
  '24h': '24h',
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  all: 'All time',
}

const n = (x: unknown) => Number(x || 0).toLocaleString('en-US')
const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// Format a KPI value for display according to its metric shape.
function fmtKpi(value: number, format: Kpi['format']): string {
  switch (format) {
    case 'pct':
      return `${(value * 100).toFixed(1)}%`
    case 'ratio':
      return value.toFixed(1)
    case 'duration': {
      const s = Math.round(value)
      return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
    }
    default:
      return n(value)
  }
}

// A ▲/▼ delta vs the previous equivalent period, coloured by whether the move is
// favourable for that metric (bounce rate falling is good; visits rising is good).
function DeltaChip({ kpi }: { kpi: Kpi }) {
  if (kpi.prev == null) return null
  if (kpi.prev === 0) {
    if (kpi.value === 0) return null
    return <span className="text-[11px] text-emerald-600">▲ new</span>
  }
  const change = (kpi.value - kpi.prev) / kpi.prev
  if (Math.abs(change) < 0.005) return <span className="text-[11px] text-stone-400">±0%</span>
  const up = kpi.value > kpi.prev
  const favourable = up === kpi.higherIsBetter
  return (
    <span className={`text-[11px] ${favourable ? 'text-emerald-600' : 'text-rose-500'}`}>
      {up ? '▲' : '▼'} {Math.abs(change * 100).toFixed(0)}%
    </span>
  )
}

function KpiTile({ kpi }: { kpi: Kpi }) {
  return (
    <div
      className={`rounded px-4 py-3 border ${
        kpi.hero ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-200'
      }`}
    >
      <div className={`text-xs uppercase tracking-wide mb-1 ${kpi.hero ? 'text-stone-300' : 'text-stone-400'}`}>
        {kpi.label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-xl font-semibold tabular-nums ${kpi.hero ? 'text-white' : 'text-stone-800'}`}>
          {fmtKpi(kpi.value, kpi.format)}
        </span>
        <DeltaChip kpi={kpi} />
      </div>
      {kpi.note && (
        <div className={`text-[11px] mt-1 ${kpi.hero ? 'text-stone-300' : 'text-stone-400'}`}>{kpi.note}</div>
      )}
    </div>
  )
}

const chip = (active: boolean) =>
  `text-xs px-2.5 py-1 rounded border transition-colors ${
    active
      ? 'border-stone-800 bg-stone-800 text-white'
      : 'border-stone-200 text-stone-600 hover:border-stone-400'
  }`

// Preset rolling windows (highlighted only when a range — not a month — is active).
function RangeSelector({ current, mode }: { current: Range; mode: SelectionMode }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {RANGES.map((r) => (
        <Link key={r} href={`/admin/analytics?range=${r}`} className={chip(mode === 'range' && r === current)}>
          {RANGE_LABEL[r]}
        </Link>
      ))}
    </div>
  )
}

// Calendar months (newest first); a month link carries no range so month mode wins.
function MonthSelector({ activeMonth }: { activeMonth: string | null }) {
  const months = recentMonths(12)
  return (
    <div className="flex flex-wrap gap-1.5">
      {months.map((m) => (
        <Link key={m.value} href={`/admin/analytics?month=${m.value}`} className={chip(m.value === activeMonth)}>
          {m.label}
        </Link>
      ))}
    </div>
  )
}

// A ranked demand list (theme / author / era / tradition / genre).
function RankList({ title, ranked, max = 12 }: { title: string; ranked: Ranked[]; max?: number }) {
  const top = ranked.slice(0, max)
  const peak = Math.max(1, ...top.map((r) => r.value))
  return (
    <div>
      <h3 className="text-xs text-stone-400 uppercase tracking-wide mb-2">{title}</h3>
      {top.length === 0 ? (
        <p className="text-xs text-stone-400">No data.</p>
      ) : (
        <ul className="space-y-1">
          {top.map((r) => (
            <li key={r.label} className="flex items-center gap-2 text-sm">
              <span className="tabular-nums text-stone-500 text-xs w-10 text-right shrink-0">{n(r.value)}</span>
              <span className="flex-1 min-w-0">
                <span className="relative block h-4">
                  <span
                    className="absolute inset-y-0 left-0 bg-stone-100 rounded-sm"
                    style={{ width: `${Math.max(4, (r.value / peak) * 100)}%` }}
                    aria-hidden
                  />
                  <span className="relative text-stone-700 truncate pl-1.5 leading-4 block">{r.label}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Props = { searchParams: Promise<{ range?: string; month?: string }> }

export default async function AnalyticsDashboard({ searchParams }: Props) {
  const { range: rawRange, month: rawMonth } = await searchParams
  const data = await getDashboardData({ range: rawRange, month: rawMonth })

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">← Admin</Link>
      </div>

      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-semibold text-stone-800">Reader analytics</h2>
      </div>
      <p className="text-xs text-stone-400 mb-5">
        Growth first — returning visits (the North Star) and their drivers — then where visits come
        from and land, then reader demand joined to the corpus (the view Umami can’t produce).
      </p>

      <div className="mb-8 space-y-2">
        <RangeSelector current={data.range} mode={data.mode} />
        <div>
          <div className="text-[11px] text-stone-400 uppercase tracking-wide mb-1.5">By month</div>
          <MonthSelector activeMonth={data.month} />
        </div>
      </div>

      {!data.ok ? (
        <section className="border border-amber-300 bg-amber-50 rounded px-4 py-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-1">Analytics unavailable</h3>
          <p className="text-xs text-amber-800 mb-3">
            Couldn’t load the demand digest for this window. Umami may be unreachable — it’s blocked
            by common ad/tracking blockers (including Keith’s own Chrome) and can’t be reached from
            CI/build environments — or the Supabase read credentials aren’t configured. The page
            itself is fine; nothing was written.
          </p>
          <pre className="text-[11px] text-amber-900/80 bg-amber-100/60 border border-amber-200 rounded px-2.5 py-2 whitespace-pre-wrap break-words">
            {data.error}
          </pre>
        </section>
      ) : (
        <Digest data={data} />
      )}
    </main>
  )
}

function Digest({ data }: { data: Extract<Awaited<ReturnType<typeof getDashboardData>>, { ok: true }> }) {
  const { digest, kpis, landingPages, landingByType, referrers, eventCounts, window: win, growthNotes } = data
  const t = digest.totals

  return (
    <div className="space-y-10">
      <p className="text-xs text-stone-400">
        <span className="text-stone-600 font-medium">{data.label}</span> · {fmtDate(win.startAt)} → {fmtDate(win.endAt)} · deltas vs the previous period · Umami access: {data.umamiMode}
      </p>

      {/* Growth — North Star first */}
      <section>
        <h2 className="text-sm font-semibold text-stone-800 mb-1">Growth</h2>
        <p className="text-xs text-stone-400 mb-4">
          Returning visits lead — the North Star. Repeat visits = visits − visitors (repeat visits,
          not unique returning visitors, which Umami’s stats endpoint doesn’t split out). Each tile
          shows the change vs the previous equivalent period.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <KpiTile key={k.key} kpi={k} />
          ))}
        </div>
        <p className="text-[11px] text-stone-400 mt-3">
          Undercount: ad/tracking blockers drop the beacon, so treat these as lower bounds and read
          shares and trends, not absolutes.
        </p>
      </section>

      {/* Acquisition — where visits come from and land */}
      <section>
        <h2 className="text-sm font-semibold text-stone-800 mb-1">Where visits come from &amp; land</h2>
        <p className="text-xs text-stone-400 mb-4">
          External referrers and the pages people arrive on — the top of the funnel that feeds
          returning visits.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
          <RankList title="Landing pages — by type" ranked={landingByType} />
          <RankList title="External referrers" ranked={referrers} />
          <RankList title="Top landing pages" ranked={landingPages} max={12} />
          <RankList title="In-site entry surface (from)" ranked={digest.fromAttribution} max={12} />
        </div>
        {growthNotes.length > 0 && (
          <ul className="mt-4 space-y-1">
            {growthNotes.map((note) => (
              <li key={note} className="text-[11px] text-amber-700">⚠ {note}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Demand by content dimension */}
      <section>
        <h2 className="text-sm font-semibold text-stone-800 mb-1">Reader demand by content dimension</h2>
        <p className="text-xs text-stone-400 mb-4">
          What readers actually open, rolled up the way Umami can’t —{' '}
          <span className="font-medium text-stone-600">{n(t.totalTextOpens)}</span> text-opens across{' '}
          <span className="font-medium text-stone-600">{n(t.distinctTextsOpened)}</span> texts. Feeds
          pipeline + backlog priority.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
          <RankList title="By theme" ranked={digest.byTheme} />
          <RankList title="By author" ranked={digest.byAuthor} />
          <RankList title="By era" ranked={digest.byEra} />
          <RankList title="By tradition" ranked={digest.byTradition} />
          <RankList title="By genre" ranked={digest.byGenre} />
        </div>
      </section>

      {/* Top texts */}
      <section>
        <h2 className="text-sm font-semibold text-stone-800 mb-3">Top texts opened</h2>
        {digest.topTexts.length === 0 ? (
          <p className="text-xs text-stone-400">No text-open events in range.</p>
        ) : (
          <div className="border border-stone-200 rounded divide-y divide-stone-100">
            {digest.topTexts.slice(0, 20).map((x) => (
              <div key={x.slug} className="flex items-center justify-between px-4 py-2.5 gap-4">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-stone-800">{x.title}</span>
                  <span className="text-xs text-stone-400 ml-2">{x.author}</span>
                  <span className="block text-[11px] text-stone-300 font-mono truncate">{x.slug}</span>
                </div>
                <span className="text-sm tabular-nums text-stone-600 shrink-0">{n(x.count)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Collections */}
      {digest.collections.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-stone-800 mb-3">Collections opened</h2>
          <div className="border border-stone-200 rounded divide-y divide-stone-100">
            {digest.collections.slice(0, 20).map((c) => (
              <div key={c.slug} className="flex items-center justify-between px-4 py-2.5 gap-4">
                <div className="min-w-0">
                  <span className="text-sm text-stone-800">{c.name}</span>
                  <span className="block text-[11px] text-stone-300 font-mono truncate">{c.slug}</span>
                </div>
                <span className="text-sm tabular-nums text-stone-600 shrink-0">{n(c.count)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Data-quality flags */}
      {(digest.unmatchedTexts.length > 0 || digest.unmatchedCollections.length > 0) && (
        <section className="border border-amber-200 bg-amber-50 rounded px-4 py-3">
          <h2 className="text-sm font-semibold text-amber-800 mb-2">⚠ Data-quality flags</h2>
          {digest.unmatchedTexts.length > 0 && (
            <>
              <p className="text-xs text-amber-800 mb-1.5">
                Slugs opened but not found in Supabase (renamed / unpublished / stale share data):
              </p>
              <ul className="space-y-0.5 mb-2">
                {digest.unmatchedTexts.slice(0, 20).map((u) => (
                  <li key={u.slug} className="text-xs text-stone-700 flex items-center gap-2">
                    <span className="tabular-nums text-stone-500 w-8 text-right">{n(u.count)}</span>
                    <span className="font-mono">{u.slug}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {digest.unmatchedCollections.length > 0 && (
            <p className="text-xs text-amber-800">
              Unmatched collection slugs:{' '}
              {digest.unmatchedCollections.map((u) => `${u.slug} (${u.count})`).join(', ')}
            </p>
          )}
        </section>
      )}

      {/* Events firing */}
      <section>
        <h2 className="text-sm font-semibold text-stone-800 mb-1">Events firing</h2>
        <p className="text-xs text-stone-400 mb-4">
          Cross-check against Growth Tracker → Events Register; investigate any event here that isn’t
          documented there, or documented events absent here.
        </p>
        {eventCounts.length === 0 ? (
          <p className="text-xs text-stone-400">No custom events in range.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {eventCounts.slice(0, 40).map((e) => (
              <span
                key={e.key}
                className="text-xs border border-stone-200 rounded px-2 py-1 text-stone-600"
              >
                {e.key} <span className="tabular-nums text-stone-400 ml-1">{n(e.count)}</span>
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
