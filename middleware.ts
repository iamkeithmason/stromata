import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import {
  SESSION_COOKIE,
  expOf,
  secretKey,
  sessionCookieOptions,
  shouldRenew,
  signSession,
} from '@/lib/admin/session'

// These paths are accessible without authentication
const UNPROTECTED = ['/admin/login', '/api/admin/login', '/api/admin/logout']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (UNPROTECTED.includes(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value

  if (!token) return unauthorized(request, pathname)

  const secret = process.env.ADMIN_COOKIE_SECRET
  if (!secret) return unauthorized(request, pathname)

  try {
    const { payload } = await jwtVerify(token, secretKey(secret))
    const response = NextResponse.next()

    // Sliding session. The cookie is 30 days from issue; without this it
    // expires 30 days after LOGIN however much it is used, which logs out a
    // phone reviewer mid-queue. Renewing on use makes the 30 days run from the
    // last request instead. Throttled by shouldRenew so an autosave storm
    // doesn't re-mint on every keystroke — see lib/admin/session.ts.
    if (shouldRenew(expOf(payload), Math.floor(Date.now() / 1000))) {
      try {
        response.cookies.set(SESSION_COOKIE, await signSession(secret), sessionCookieOptions())
      } catch {
        // A failed renewal must never fail the request: the token in hand is
        // still valid, and the worst case is that the session expires on its
        // original schedule.
      }
    }

    return response
  } catch {
    return unauthorized(request, pathname)
  }
}

function unauthorized(request: NextRequest, pathname: string) {
  return pathname.startsWith('/api/')
    ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    : NextResponse.redirect(new URL('/admin/login', request.url))
}

export const config = {
  // Protect all /admin pages and /api/admin routes
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
