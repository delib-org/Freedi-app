import { NextRequest, NextResponse } from 'next/server';
import { SECURE_UID_COOKIE } from './src/lib/auth/sessionCookies';

const LEGACY_UID_COOKIE = 'userId';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const SERVER_MINTED_ANON_ID = /^anon_\d+_[a-z0-9]+$/;

/**
 * Make sure every visitor has a server-minted anonymous id in `_uid`.
 *
 * This is a placeholder for first paint and for visitors without Firebase, and
 * the server treats it as low-privilege only (src/lib/auth/requestIdentity.ts).
 *
 * It must never hold a real account's uid. It used to copy the JS-writable
 * `userId` cookie into `_uid`, which made any forged uid look server-issued.
 * Google sign-in now creates a signed session cookie through /api/auth/session
 * instead, and that session always takes priority over `_uid`. A `_uid` left
 * over from the old copy is replaced here.
 *
 * The edge runtime cannot verify Firebase session cookies, so verification
 * happens in the Node route handlers and server components.
 */
export function middleware(request: NextRequest) {
  const secureUid = request.cookies.get(SECURE_UID_COOKIE)?.value;
  if (secureUid && SERVER_MINTED_ANON_ID.test(secureUid)) {
    return NextResponse.next();
  }

  const legacyUid = request.cookies.get(LEGACY_UID_COOKIE)?.value;
  const isProduction = process.env.NODE_ENV === 'production';
  const anonymousId =
    legacyUid && SERVER_MINTED_ANON_ID.test(legacyUid)
      ? legacyUid
      : `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  // Rewrite the incoming cookie too, so a server page rendered on this same
  // request sees the replacement rather than the stale value.
  request.cookies.set(SECURE_UID_COOKIE, anonymousId);
  const response = NextResponse.next({ request: { headers: request.headers } });

  response.cookies.set(SECURE_UID_COOKIE, anonymousId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  // Also set the legacy cookie for client-side reads, but never overwrite one
  // the browser already holds: after sign-in it carries the real uid.
  if (!legacyUid) {
    response.cookies.set(LEGACY_UID_COOKIE, anonymousId, {
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
