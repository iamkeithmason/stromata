'use client'

import { useEffect, useState } from 'react'

/**
 * A subtle "next agent run" countdown for the admin dashboard.
 *
 * The Scout and Sourcer fire on GitHub Actions cron schedules. This mirrors
 * those crons so Keith can see at a glance how long until the next run without
 * opening the Actions tab. It is display-only — it reads nothing and triggers
 * nothing.
 *
 * KEEP IN SYNC with the workflow crons (all times UTC):
 *   .github/workflows/scout.yml    → 0 6 1,15 * *  (06:00 UTC, 1st & 15th)
 *   .github/workflows/sourcer.yml  → 0 7 1 * *     (07:00 UTC, 1st)
 */
const SCHEDULES: { label: string; days: number[]; hourUtc: number }[] = [
  { label: 'Scout', days: [1, 15], hourUtc: 6 },
  { label: 'Sourcer', days: [1], hourUtc: 7 },
]

/** Soonest future day@hour (UTC) for a monthly-on-these-days schedule. */
function nextFire(days: number[], hourUtc: number, now: Date): Date {
  const sorted = [...days].sort((a, b) => a - b)
  // Walk this month and the next few; the first future candidate wins.
  for (let m = 0; m < 4; m++) {
    for (const day of sorted) {
      const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, day, hourUtc, 0, 0))
      if (t.getTime() > now.getTime()) return t
    }
  }
  // Unreachable in practice (a match always exists within 4 months).
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, sorted[0], hourUtc))
}

/** "2d 3h 45m" style delta; coarse and quiet. */
function formatDelta(ms: number): string {
  if (ms <= 0) return 'now'
  const totalMin = Math.floor(ms / 60000)
  const d = Math.floor(totalMin / (60 * 24))
  const h = Math.floor((totalMin % (60 * 24)) / 60)
  const min = totalMin % 60
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (d || h) parts.push(`${h}h`)
  parts.push(`${min}m`)
  return parts.join(' ')
}

export default function AgentSchedule() {
  // Null until mounted so server and first client paint match (no hydration
  // mismatch from a time computed during SSR).
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!now) return <p className="mt-2 text-xs text-stone-400">&nbsp;</p>

  const items = SCHEDULES.map((s) => {
    const next = nextFire(s.days, s.hourUtc, now)
    return {
      label: s.label,
      delta: formatDelta(next.getTime() - now.getTime()),
      title: `${next.toISOString().replace('.000Z', 'Z')} · fires in ${formatDelta(next.getTime() - now.getTime())}`,
    }
  })

  return (
    <p className="mt-2 text-xs text-stone-400">
      Next agent run —{' '}
      {items.map((it, i) => (
        <span key={it.label} title={it.title} className="cursor-help">
          {i > 0 && <span className="text-stone-300"> · </span>}
          <span className="text-stone-500">{it.label}</span> in {it.delta}
        </span>
      ))}
    </p>
  )
}
