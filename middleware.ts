import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

// These paths are accessible without authentication
const UNPROTECTED = ['/admin/login', '/api/admin/login', '/api/admin/logout']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (UNPROTECTED.includes(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get('admin_session')?.value

  if (!token) {
    return pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : NextResponse.redirect(new URL('/admin/login', request.url))
  }

  try {
    const secret = new TextEncoder().encode(process.env.ADMIN_COOKIE_SECRET!)
    await jwtVerify(token, secret)
    return NextResponse.next()
  } catch {
    return pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : NextResponse.redirect(new URL('/admin/login', request.url))
  }
}

export const config = {
  // Protect all /admin pages and /api/admin routes
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
