'use client'
import { useEffect } from 'react'

function getISOWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${weekNo}`
}

export function TrackReaderReturn() {
  useEffect(() => {
    const currentWeek = getISOWeekKey()
    const lastWeek = localStorage.getItem('stromata-last-week')
    if (lastWeek && lastWeek !== currentWeek) {
      window.umami?.track('reader-return')
    }
    localStorage.setItem('stromata-last-week', currentWeek)
  }, [])
  return null
}
