import { NextResponse } from 'next/server';

/**
 * POST /api/auth/clear-session
 * Clears all identity cookies, including the HttpOnly `_uid` cookie that
 * client-side JavaScript cannot touch. Used when a previously authenticated
 * user's Firebase session could not be restored: instead of silently
 * downgrading them to a fresh anonymous account, we sign them out honestly
 * so they can log in again with their real account.
 */
export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true });

  const expired = { path: '/', maxAge: 0 };
  response.cookies.set('_uid', '', { ...expired, httpOnly: true });
  response.cookies.set('userId', '', expired);
  response.cookies.set('userDisplayName', '', expired);

  return response;
}
