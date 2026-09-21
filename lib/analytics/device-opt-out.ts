/**
 * Umami honours a `umami.disabled` flag in localStorage: when it is set, the
 * script loads but sends nothing. We set it on successful admin login, so any
 * device Keith signs in from stops polluting the site's own numbers — the
 * founder browsing his own library is not a reader.
 *
 * localStorage is per-origin and per-device, which is exactly the grain we
 * want, and it survives sign-out (the exclusion is a property of the device,
 * not of the session). Clearing it is a deliberate act from the admin header.
 */

export const UMAMI_DISABLED_KEY = 'umami.disabled'

/** Stop this device reporting to Umami. Safe to call when storage is blocked. */
export function disableAnalyticsOnThisDevice(): void {
  try {
    window.localStorage.setItem(UMAMI_DISABLED_KEY, '1')
  } catch {
    /* private mode / storage blocked — nothing to do but carry on */
  }
}

/** Let this device report again. */
export function enableAnalyticsOnThisDevice(): void {
  try {
    window.localStorage.removeItem(UMAMI_DISABLED_KEY)
  } catch {
    /* as above */
  }
}

/** Whether this device is currently excluded. */
export function isAnalyticsDisabledOnThisDevice(): boolean {
  try {
    return window.localStorage.getItem(UMAMI_DISABLED_KEY) === '1'
  } catch {
    return false
  }
}
