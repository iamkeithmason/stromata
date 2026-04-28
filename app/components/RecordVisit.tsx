'use client'
import { useEffect } from 'react'
import { recordVisit, type ReadingHistoryEntry } from '@/lib/reading-history'

type Props = Omit<ReadingHistoryEntry, 'visitedAt'>

export function RecordVisit(props: Props) {
  useEffect(() => {
    recordVisit(props)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.slug])

  return null
}
