/**
 * track-when-ready — fire an event once the Umami tracker actually exists.
 *
 * `window.umami?.track(...)` in a mount effect is a silent coin toss. The
 * tracker is loaded `defer` + `afterInteractive`, so React's effects routinely
 * run first, `window.umami` is undefined, and the optional chaining swallows
 * the event without a trace.
 *
 * This is not hypothetical. Over 30 days of production data the two events that
 * then fired on text-page mount (`text-view`, and a from-less `text-open` that
 * was removed on 2 Nov 2026) recorded 8 each, while `text-read` — same pages, but fired later, after a
 * scroll — recorded 52. `text-read` cannot outnumber the mounts it happens on,
 * so roughly six in seven mount-time events were being dropped on the floor.
 *
 * So: fire now if the tracker is up, otherwise poll briefly and fire when it
 * arrives. If it never arrives — blocked by an ad blocker, or the reader left —
 * nothing fires, which is the correct and unavoidable outcome.
 */

export type UmamiWindow = {
  umami?: { track: (event: string, data?: Record<string, string | number | null>) => void }
}

const DEFAULT_INTERVAL_MS = 150
/** Long enough for a slow connection, short enough not to outlive the visit. */
const DEFAULT_TIMEOUT_MS = 15000

export type TrackWhenReadyOptions = {
  win?: UmamiWindow
  intervalMs?: number
  timeoutMs?: number
}

type Tracker = NonNullable<UmamiWindow['umami']>

/**
 * Run `fn` with the tracker as soon as one exists.
 *
 * Returns a cancel function — call it from an effect cleanup so a reader who
 * navigates away mid-wait does not fire for a page they have left.
 *
 * Callers that also record state (a session ledger, a "fired" flag) should do
 * it INSIDE `fn`, not before calling this: a ledger written when the tracker
 * never loads consumes a depth that was never reported, and the next page then
 * reports a depth 2 with no matching depth 1.
 */
export function whenTrackerReady(
  fn: (tracker: Tracker) => void,
  { win, intervalMs = DEFAULT_INTERVAL_MS, timeoutMs = DEFAULT_TIMEOUT_MS }: TrackWhenReadyOptions = {}
): () => void {
  const w = win ?? (typeof window === 'undefined' ? undefined : (window as UmamiWindow))
  if (!w) return () => {}

  if (w.umami) {
    fn(w.umami)
    return () => {}
  }

  let elapsed = 0
  const timer = setInterval(() => {
    elapsed += intervalMs
    if (w.umami) {
      clearInterval(timer)
      fn(w.umami)
    } else if (elapsed >= timeoutMs) {
      clearInterval(timer)
    }
  }, intervalMs)

  return () => clearInterval(timer)
}

/** Track `event` as soon as the tracker is available. */
export function trackWhenReady(
  event: string,
  data: Record<string, string | number | null>,
  options: TrackWhenReadyOptions = {}
): () => void {
  return whenTrackerReady((tracker) => tracker.track(event, data), options)
}
