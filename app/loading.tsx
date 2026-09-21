// Root loading UI: Next streams this in immediately while a page's data
// fetch is still in flight, so a click has *something* to show for itself
// rather than a frozen tab. Added 2026-09-21 alongside app/error.tsx — see
// that file for why both exist together.
export default function Loading() {
  return (
    <div
      style={{ background: 'var(--paper)' }}
      className="min-h-screen flex items-center justify-center"
    >
      <p className="font-serif text-lg" style={{ color: 'var(--ink-mute)' }}>
        Loading…
      </p>
    </div>
  )
}
