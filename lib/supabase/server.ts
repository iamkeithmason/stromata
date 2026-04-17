import { createClient } from '@supabase/supabase-js'

// Uses the service role key — bypasses Row Level Security.
// Only call this from server-side code (API routes, Server Components).
// Never expose this client to the browser.
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
