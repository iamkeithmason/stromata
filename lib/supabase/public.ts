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
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
