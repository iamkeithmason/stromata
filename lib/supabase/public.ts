import { createClient } from '@supabase/supabase-js'

// Anon-key Supabase client for PUBLIC pages — subject to Row Level Security.
//
// Under the policies added in supabase/migrations/023_public_read_policies.sql
// this client can only ever see published texts and collections, their theme
// and scripture links, public authors, and the reference tables. Drafts are
// invisible at the database level, so a page that forgets `.eq('published',
// true)` returns nothing rather than leaking a draft.
//
// SELECT only: no insert/update/delete policy exists for anon, and migration
// 024 removes the table-level write grants as well. Writes go through
// `createServerClient()` from '@/lib/supabase/server'.
//
// Safe to call from either a Server Component or the browser — the anon key is
// already published in the client bundle.
//
// EVERY READ THROUGH THIS CLIENT IS CACHED FOR AN HOUR
//
// Next 15 sends `fetch` with `cache: 'no-store'` unless told otherwise, so each
// of these queries ran again on every request — including every crawler hit.
// The pages that carry `generateStaticParams` escape that by being prerendered,
// but the ones without it (`/texts/[slug]`, `/authors/[slug]`,
// `/collections/[slug]`, `/scripture/[ref]` — 4,268 reference routes alone) are
// rendered on demand, and `export const revalidate` does not help them: it
// governs the route cache, which a route Next has classed as dynamic never
// enters. Measured on a production build before this change, three requests for
// the same scripture reference cost three round trips, and the reader page
// re-downloaded the text's whole body each time.
//
// Tagging the fetch moves those reads into Next's Data Cache, so a repeated
// query is answered locally and Supabase sees it at most once an hour however
// many times the page is requested. An hour matches the `revalidate` window the
// public pages already use, and `revalidatePath` — which the publish path calls
// through `lib/publishing/publish-text.ts` — drops these entries along with the
// rendered page, so publishing still shows up immediately rather than an hour
// later.
//
// This is deliberately on the PUBLIC client only. The admin surfaces read
// through `createServerClient()`, which stays uncached: a back-office form must
// show what is in the database now, not what was there this hour.
//
// `{ live: true }` opts a caller out. The feeds — /rss, /sitemap.xml, /llms.txt
// — declare `dynamic = 'force-dynamic'` and `revalidate = 0` because they are
// meant to be generated fresh on every request, and a default that quietly
// overrode that would make them say something their own source file denies.
/** Matches the `revalidate` window the public pages declare. */
const CACHE_SECONDS = 3600

export function createPublicClient(options: { live?: boolean } = {}) {
  const cacheInit: RequestInit = options.live
    ? { cache: 'no-store' }
    : ({ next: { revalidate: CACHE_SECONDS } } as RequestInit)

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        // These options are ignored in the browser, where this client also runs.
        fetch: (input, init) => fetch(input, { ...init, ...cacheInit }),
      },
    }
  )
}
