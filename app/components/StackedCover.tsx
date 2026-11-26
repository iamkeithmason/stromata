// ── StackedCover — multi-volume depth affordance ───────────────────────────
// Adds 2 subtle offset layers behind a BookCover to signal "collection".
//
// Paint-order note: `position:absolute` elements with z-index:auto are painted
// in step 5 of the stacking algorithm — AFTER in-flow block content (step 3).
// So without explicit z-index the spine layers would appear ON TOP of the cover.
// Fix: the cover is wrapped in position:relative + z-index:1, which enters the
// positioned-elements paint step with a higher z-index than the auto spine divs.
//
// The container reserves space for the offsets via marginRight/Bottom so the
// stacking doesn't clip the cover or disturb grid alignment.
export function StackedCover({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', marginRight: 8, marginBottom: 5 }}>
      {/* Spine layer 2 — furthest back (z-index:auto = 0) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          top: 5,
          left: 8,
          background: 'var(--cover-stack-back)',
        }}
      />
      {/* Spine layer 1 — middle (z-index:auto = 0) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          top: 2.5,
          left: 4,
          background: 'var(--cover-stack-mid)',
        }}
      />
      {/* Cover — z-index:1 lifts it above the auto spine layers */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}
