import type { PostgrestError } from '@supabase/supabase-js'

// `const { data } = await supabase.from(...).select(...)` discards `error`,
// and `data ?? []` cannot tell "the query ran and found nothing" apart from
// "the query failed." On a page with `export const revalidate`, that's not
// just a wrong render: a failed read that resolves as an empty array is a
// SUCCESSFUL render as far as ISR is concerned, so Next bakes "0 results"
// into the static cache and serves it to every visitor until the next
// revalidation window — which, if the database is still unwell, fails the
// same way and extends the outage by another hour each time.
//
// Found 2026-09-21: a Supabase incident left `/texts` and `/authors` — both
// on this exact pattern — showing "0 texts" / "0 authors" to real visitors,
// which is what a reader clicking around an apparently-fine homepage
// actually hit. `rowsOrThrow` makes a failed read throw instead, so Next
// keeps serving the last good cache and retries at the next revalidation
// rather than overwriting a working page with an empty one.
export function rowsOrThrow<T>(data: T[] | null, error: PostgrestError | null): T[] {
  if (error) throw error
  return data ?? []
}
