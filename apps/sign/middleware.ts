import { NextRequest, NextResponse } from 'next/server';

const SECURE_UID_COOKIE = '_uid';
const LEGACY_UID_COOKIE = 'userId';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Middleware to ensure an HttpOnly secure userId cookie exists.
 * - If `_uid` cookie exists, pass through.
 * - If only legacy `userId` exists, copy it to `_uid` as HttpOnly.
 * - If neither exists, generate a new anonymous ID and set both.
 *
 * The `_uid` cookie is HttpOnly (invisible to JS, immune to XSS).
 * The legacy `userId` cookie is kept for backward-compatible client reads.
 */
export function middleware(request: NextRequest) {
  const secureUid = request.cookies.get(SECURE_UID_COOKIE)?.value;
  const legacyUid = request.cookies.get(LEGACY_UID_COOKIE)?.value;

  // Already has secure cookie — pass through
  if (secureUid) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  // Use legacy userId if available, otherwise generate new anonymous ID
  const userId = legacyUid || `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  const isProduction = process.env.NODE_ENV === 'production';

  // Set HttpOnly secure cookie (server-only, XSS-proof)
  response.cookies.set(SECURE_UID_COOKIE, userId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  // Also set legacy cookie if it doesn't exist (for client-side reads)
  if (!legacyUid) {
    response.cookies.set(LEGACY_UID_COOKIE, userId, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
  }

  return response;
}

export const config = {
  // Run on all routes except static files and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
