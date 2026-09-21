'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Filter state for an index browser, seeded from the query string on the client
 * rather than on the server.
 *
 * WHY THIS EXISTS
 *
 * `/texts` and `/authors` filter and sort entirely in the browser — the server
 * sends every row once and the browser narrows it, keeping the URL in step with
 * `history.replaceState` rather than a router navigation. The only thing the
 * server did with `searchParams` was choose the browser's *initial* filter.
 *
 * But a page that reads `searchParams` is a dynamic page: Next opts it out of
 * the full route cache, so `export const revalidate` has no effect on it and
 * every request — every crawler hit included — re-ran the query behind it.
 * `/texts` reads the whole published library, so that one detail was the
 * difference between querying Supabase hourly and querying it per visit.
 *
 * Moving the seed to the client costs nothing real: the filtered URLs are
 * `replaceState` variants that canonicalise to the bare path and are not
 * indexed, and the filtering they drive was always client-side anyway. What it
 * buys is that both index pages become fully static and are served from the
 * cache.
 *
 * THE ORDERING TRAP
 *
 * The mirror-state-to-URL effect must not run on the first pass. If it does, it
 * writes the default (empty) filters over the query string a moment before the
 * seeding effect reads it, and every shared filtered link silently opens
 * unfiltered. The two effects below are declared in the order they must run,
 * and the mirror skips its first invocation for exactly that reason.
 */
export function useUrlFilters<F>(
  defaults: F,
  fromParams: (params: URLSearchParams) => F,
  toParams: (filters: F) => URLSearchParams,
): [F, React.Dispatch<React.SetStateAction<F>>] {
  const [filters, setFilters] = useState<F>(defaults)

  // Callers pass inline arrows, whose identity changes every render. Holding
  // them in refs keeps the effects keyed on `filters` alone, so the URL is
  // rewritten when the filters change and not on every re-render.
  const fromRef = useRef(fromParams)
  const toRef = useRef(toParams)
  fromRef.current = fromParams
  toRef.current = toParams

  // 1. Seed from the URL, once, after hydration. Server and client both render
  //    the defaults first, so there is no hydration mismatch; a visitor opening
  //    a filtered link sees the filter applied on the next frame.
  useEffect(() => {
    setFilters(fromRef.current(new URLSearchParams(window.location.search)))
  }, [])

  // 2. Mirror back to the URL, skipping the first run (see above).
  const seeded = useRef(false)
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true
      return
    }
    const qs = toRef.current(filters).toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [filters])

  return [filters, setFilters]
}
