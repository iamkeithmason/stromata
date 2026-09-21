import { SignJWT } from 'jose'
import type { JWTPayload } from 'jose'

/**
 * The admin session cookie — one definition, shared by the login route (which
 * mints it) and the middleware (which verifies and now renews it).
 *
 * These used to live only in the login route. The middleware needs the same
 * lifetime and the same cookie options to renew a session without silently
 * changing its shape, and two hand-written copies of "30 days, httpOnly,
 * sameSite lax" is how a renewed cookie ends up subtly different from a
 * freshly-minted one.
 *
 * Edge-runtime safe: `jose` only, no Supabase, no Node built-ins.
 */

export const SESSION_COOKIE = 'admin_session'

/** How long a freshly minted or renewed session lasts. */
export const SESSION_DAYS = 30

/**
 * Renew once the remaining life drops below this.
 *
 * WHY THIS IS NOT "renew on every request": the review queue autosaves every
 * ~900ms while you type, and every one of those requests passes through this
 * middleware. Renewing unconditionally would attach a fresh `Set-Cookie` to
 * hundreds of responses per review session for no benefit.
 *
 * The gap between the two numbers is what makes it self-limiting. A renewal
 * resets the remaining life to 30 days, which is above the 25-day threshold,
 * so the next renewal cannot happen for another 5 days of use. One cookie
 * write per 5 days of activity, regardless of how many requests you make.
 *
 * The practical effect: the session stays alive as long as it is used at least
 * once every 30 days, instead of expiring 30 days after login however much you
 * used it. That is the whole point — a phone reviewer working through the queue
 * every few days should never be logged out.
 */
export const RENEW_BELOW_DAYS = 25

const DAY_SECONDS = 60 * 60 * 24

export function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

/** Mint a session token. Used for both first login and renewal. */
export async function signSession(secret: string): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey(secret))
}

/** The cookie options, identical whether the token is new or renewed. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_DAYS * DAY_SECONDS,
    path: '/',
  }
}

/**
 * Should this token be renewed now?
 *
 * Pure, and unit tested: the renewal threshold is the kind of arithmetic that
 * is easy to get backwards (renewing when there is *plenty* of time left, or
 * never renewing at all), and getting it wrong is invisible until someone is
 * logged out mid-review a month later.
 *
 * @param exp  the JWT `exp` claim, in seconds since the epoch
 * @param nowSeconds  current time in seconds since the epoch
 */
export function shouldRenew(
  exp: number | undefined,
  nowSeconds: number,
  renewBelowDays = RENEW_BELOW_DAYS
): boolean {
  // No expiry claim: nothing to reason about, and re-minting on every request
  // is exactly what the threshold exists to avoid. Leave it alone.
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return false
  const remainingSeconds = exp - nowSeconds
  // Already expired: jwtVerify will have rejected it before we get here, but
  // if it somehow reaches us, renewing would extend a dead session.
  if (remainingSeconds <= 0) return false
  return remainingSeconds < renewBelowDays * DAY_SECONDS
}

/** Narrow a verified payload's `exp` without an `any` cast. */
export function expOf(payload: JWTPayload): number | undefined {
  return typeof payload.exp === 'number' ? payload.exp : undefined
}
