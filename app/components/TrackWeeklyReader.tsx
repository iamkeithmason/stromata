'use client'
import { useEffect } from 'react'

const STORAGE_KEY = 'stromata:week-visits'
const SESSION_KEY = 'stromata:weekly-reader-fired'

function getWeekStart(ts: number): number {
  const d = new Date(ts)
  const day = d.getDay()
  // Shift to Monday (treat Sunday as end of previous week)
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function recordAndCountWeeks(): number {
  const now = Date.now()
  const cutoff = now - 30 * 24 * 60 * 60 * 1000

  const raw = localStorage.getItem(STORAGE_KEY)
  const stored: number[] = raw ? JSON.parse(raw) : []

  const weeks = new Set(stored.filter(w => w >= cutoff))
  weeks.add(getWeekStart(now))

  localStorage.setItem(STORAGE_KEY, JSON.stringify([...weeks]))
  return weeks.size
}

export function TrackWeeklyReader() {
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return
    const weeks = recordAndCountWeeks()
    if (weeks >= 2) {
      sessionStorage.setItem(SESSION_KEY, '1')
      window.umami?.track('weekly-reader', { weeks })
    }
  }, [])
  return null
}
