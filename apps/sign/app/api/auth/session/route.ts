import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromCookie, getUserDisplayNameFromCookie } from '@/lib/utils/user';
import { logger } from '@/lib/utils/logger';

export interface SessionResponse {
  authenticated: boolean;
  user: {
    userId: string;
    displayName: string | null;
  } | null;
}

/**
 * GET /api/auth/session
 * Returns the current user's session status
 */
export async function GET(request: NextRequest): Promise<NextResponse<SessionResponse>> {
  try {
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    if (!userId) {
      return NextResponse.json({
        authenticated: false,
        user: null,
      });
    }

    const displayName = getUserDisplayNameFromCookie(cookieHeader);

    return NextResponse.json({
      authenticated: true,
      user: {
        userId,
        displayName,
      },
    });
  } catch (error) {
    logger.error('[API] Session check failed:', error);

    return NextResponse.json({
      authenticated: false,
      user: null,
    });
  }
}

/**
 * DELETE /api/auth/session
 * Clears the user's session cookies (logout)
 */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true });

  // Clear auth cookies
  response.cookies.set('userId', '', {
    path: '/',
    maxAge: 0,
  });

  response.cookies.set('userDisplayName', '', {
    path: '/',
    maxAge: 0,
  });

  return response;
}
