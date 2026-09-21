'use client'

// Root error boundary. Before this existed, a failed Supabase read on a
// render-on-demand page (texts/[slug], authors/[slug], collections/[slug])
// either hung until the platform's own function timeout or — for the ones
// that treated `data: null` as "not found" — rendered a false 404. Both look
// identical to a reader: they click a link and nothing usable happens.
// See lib/supabase/not-found.ts and the QUERY_TIMEOUT_MS comment in
// lib/supabase/public.ts, added the same day for the same outage.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div
      style={{ background: 'var(--paper)' }}
      className="min-h-screen flex items-center justify-center px-8"
    >
      <div className="text-center max-w-md">
        <h1 className="font-serif text-2xl mb-3" style={{ color: 'var(--ink)' }}>
          This page couldn&rsquo;t load
        </h1>
        <p className="font-serif leading-relaxed mb-6" style={{ color: 'var(--ink-mute)' }}>
          Something between here and the library stalled. It&rsquo;s usually temporary —
          try again in a moment.
        </p>
        <button
          onClick={() => reset()}
          className="font-serif px-5 py-2 border transition-opacity hover:opacity-70"
          style={{ borderColor: 'var(--gold)', color: 'var(--gold-ink)' }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
