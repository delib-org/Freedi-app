import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '../firebase/admin';
import { logError } from '../utils/errorHandling';
import { SESSION_COOKIE } from './sessionCookies';

const EXPIRED_SESSION_CODES = new Set([
  'auth/session-cookie-expired',
  'auth/session-cookie-revoked',
  'auth/argument-error',
]);

interface CookieReader {
  get: (name: string) => { value: string } | undefined;
}

/**
 * The uid of the signed session cookie, for server-rendered pages, which get no
 * Authorization header. The unsigned `_uid` and `userId` cookies are forgeable
 * and must not be used to decide whose data to show.
 *
 * @returns The verified uid, or null when there is no valid session.
 */
export async function getSessionUid(cookieStore: CookieReader): Promise<string | null> {
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;

  try {
    initializeFirebaseAdmin();
    const decoded = await getAuth().verifySessionCookie(sessionCookie);

    return decoded.uid;
  } catch (error) {
    const code = (error as { code?: string } | undefined)?.code;
    if (!code || !EXPIRED_SESSION_CODES.has(code)) {
      logError(error, { operation: 'serverSession.getSessionUid' });
    }

    return null;
  }
}
