import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getVerifiedUserId, unauthorizedResponse } from '@/lib/auth/requestIdentity';
import { extractBearerToken } from '@/lib/auth/verifyAdmin';
import {
  SESSION_COOKIE,
  SESSION_MARKER_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth/sessionCookies';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { logError } from '@/lib/utils/errorHandling';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';

const MS_PER_SECOND = 1000;

/**
 * POST /api/auth/session
 * Exchange an ID token for a signed session cookie, so server-rendered pages
 * can tell who is asking. The token is read from a header, never the body: an
 * HTML form on another site cannot set one, which rules out login CSRF.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.STANDARD);
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await getVerifiedUserId(request);
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!userId || !token) return unauthorizedResponse();

  try {
    initializeFirebaseAdmin();
    const sessionCookie = await getAuth().createSessionCookie(token, {
      expiresIn: SESSION_MAX_AGE_SECONDS * MS_PER_SECOND,
    });
    const response = NextResponse.json({ success: true });
    const shared = {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/',
    };
    response.cookies.set(SESSION_COOKIE, sessionCookie, { ...shared, httpOnly: true });
    response.cookies.set(SESSION_MARKER_COOKIE, userId, { ...shared, httpOnly: false });

    return response;
  } catch (error) {
    logError(error, { operation: 'api.auth.session.POST', userId });

    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/session
 * Clear the session cookies on sign-out.
 */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0, httpOnly: true });
  response.cookies.set(SESSION_MARKER_COOKIE, '', { path: '/', maxAge: 0 });

  return response;
}
