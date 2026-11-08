import { NextRequest, NextResponse } from 'next/server';
import { getAuthAdmin, verifyAuthHeader } from '@/lib/firebase/admin';
import { getVerifiedIdentity } from '@/lib/auth/requestIdentity';
import {
  SECURE_UID_COOKIE,
  SESSION_COOKIE,
  SESSION_MARKER_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth/sessionCookies';
import { logError } from '@/lib/utils/errorHandling';

const MS_PER_SECOND = 1000;
const STATUS_UNAUTHORIZED = 401;
const STATUS_SERVER_ERROR = 500;

export interface SessionResponse {
  authenticated: boolean;
  user: {
    userId: string;
    displayName: string | null;
  } | null;
}

/**
 * GET /api/auth/session
 * Returns the verified session status. A bare `_uid` cookie is not a session.
 */
export async function GET(request: NextRequest): Promise<NextResponse<SessionResponse>> {
  const verified = await getVerifiedIdentity(request);

  return NextResponse.json({
    authenticated: Boolean(verified),
    user: verified ? { userId: verified.uid, displayName: verified.displayName } : null,
  });
}

/**
 * POST /api/auth/session
 * Exchange an ID token for a signed session cookie. The token is read from a
 * header, never the body: an HTML form on another site cannot set one, which
 * rules out login CSRF without any Origin checks.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authorization = request.headers.get('authorization');
  const verified = await verifyAuthHeader(authorization);
  if (!verified || !authorization) {
    return NextResponse.json({ error: 'Invalid token' }, { status: STATUS_UNAUTHORIZED });
  }

  try {
    const idToken = authorization.replace(/^Bearer\s+/i, '');
    const sessionCookie = await getAuthAdmin().createSessionCookie(idToken, {
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
    response.cookies.set(SESSION_MARKER_COOKIE, verified.uid, { ...shared, httpOnly: false });

    return response;
  } catch (error) {
    logError(error, { operation: 'api.auth.session.POST', userId: verified.uid });

    return NextResponse.json({ error: 'Failed to create session' }, { status: STATUS_SERVER_ERROR });
  }
}

/**
 * DELETE /api/auth/session
 * Clears the user's session cookies (logout)
 */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true });
  const expired = { path: '/', maxAge: 0 };

  response.cookies.set(SESSION_COOKIE, '', { ...expired, httpOnly: true });
  response.cookies.set(SECURE_UID_COOKIE, '', { ...expired, httpOnly: true });
  response.cookies.set(SESSION_MARKER_COOKIE, '', expired);
  response.cookies.set('userId', '', expired);
  response.cookies.set('userDisplayName', '', expired);

  return response;
}
