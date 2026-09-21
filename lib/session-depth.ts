/**
 * session-depth — how many DISTINCT texts a reader has opened this session.
 *
 * Backs the `text-session-depth` threshold event: the first and second distinct
 * text of a session each fire once, so first→second conversion is
 * count(depth=2) ÷ count(depth=1) — one event, no session joins in Umami.
 *
 * The logic lives here rather than in the component so it can be tested without
 * a browser; the component owns only the `window.umami?.track` call.
 */

export const SESSION_TEXTS_KEY = 'stromata-session-texts'

/** Depths above this are not interesting enough to pay an event for. */
export const MAX_TRACKED_DEPTH = 2

/** The subset of the Storage interface this module needs. */
export type SessionStore = Pick<Storage, 'getItem' | 'setItem'>

/** Read the session's distinct-slug list, tolerating absent/corrupt storage. */
export function readSessionTexts(store: SessionStore): string[] {
  try {
    const raw = store.getItem(SESSION_TEXTS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is string => typeof s === 'string')
  } catch {
    // Private mode, blocked storage, or a value some other tab mangled.
    return []
  }
}

/**
 * Record a text view and report the depth that should be tracked.
 *
 * Returns the depth (1 or 2) when this view is the session's Nth *distinct*
 * text and N is worth an event; returns null when nothing should fire —
 * a reload, a back-navigation to an already-seen text, or depth 3+.
 */
export function recordTextVisit(store: SessionStore, slug: string): number | null {
  if (!slug) return null

  const seen = readSessionTexts(store)
  // A reload or back/forward onto a text already counted this session.
  if (seen.includes(slug)) return null

  const next = [...seen, slug]
  try {
    store.setItem(SESSION_TEXTS_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked. Without persistence we cannot tell a reload from
    // a new text, so stay silent rather than inflate depth=1.
    return null
  }

  return next.length <= MAX_TRACKED_DEPTH ? next.length : null
}
