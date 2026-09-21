// Service-role Supabase client — BYPASSES Row Level Security.
//
// `import 'server-only'` makes this module a build-time error to pull into a
// Client Component, so the service-role key can never be bundled for the
// browser. Do not remove it.
//
// Use this only where bypassing RLS is the point:
//   • /admin pages and /api/admin routes
//   • server-side writes
//   • scripts and the Scout/Sourcer agents (which read drafts)
//
// Public pages must use `createPublicClient()` from '@/lib/supabase/public'
// instead — it reads with the anon key, so the database itself guarantees that
// only published content comes back. See supabase/migrations/023 and 024.
import 'server-only'
import { createClient } from '@supabase/supabase-js'

export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
