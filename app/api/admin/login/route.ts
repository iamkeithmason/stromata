import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/admin/session'

export async function POST(request: NextRequest) {
  const { password } = await request.json()

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const secret = process.env.ADMIN_COOKIE_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Server is not configured for admin login.' }, { status: 500 })
  }

  // Lifetime and cookie options come from lib/admin/session.ts, shared with the
  // middleware that renews this cookie — so a renewed session is byte-for-byte
  // the same shape as a fresh one.
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, await signSession(secret), sessionCookieOptions())
  return response
}
