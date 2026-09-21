import { notFound } from 'next/navigation'
import type { PostgrestError } from '@supabase/supabase-js'

// `.single()` returns `data: null` for two very different reasons, and every
// render-on-demand detail page (texts/[slug], authors/[slug],
// collections/[slug], scripture/[ref]) used to treat them the same: call
// `notFound()` whenever `data` was falsy. One of those reasons really is "no
// such row" (PostgREST's PGRST116, the row genuinely isn't there). The other
// is any transient failure reaching the database — a timeout, a dropped
// connection — which also comes back as `data: null` with a *different*
// error attached. Collapsing the two meant a live database hiccup rendered
// as a 404, telling a reader (and search engines) that a text does not
// exist when the truth is just "ask again in a moment."
//
// `assertFound` keeps the real 404 and turns everything else into a thrown
// error, so the nearest `error.tsx` renders instead — see the root one for
// why that boundary exists.
export function assertFound<T>(data: T | null, error: PostgrestError | null): T {
  if (data) return data
  if (error && error.code !== 'PGRST116') throw error
  notFound()
}
