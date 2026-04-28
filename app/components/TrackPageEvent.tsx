'use client'
import { useEffect } from 'react'

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number | null>) => void }
  }
}

type Props = {
  event: string
  data?: Record<string, string | number | null | undefined>
}

export function TrackPageEvent({ event, data }: Props) {
  useEffect(() => {
    window.umami?.track(event, data as Record<string, string | number | null>)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
