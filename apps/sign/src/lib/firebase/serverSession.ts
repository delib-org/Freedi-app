import type { User } from 'firebase/auth';
import { SESSION_MARKER_COOKIE } from '@/lib/auth/sessionCookies';
import { logError } from '@/lib/utils/errorHandling';

export type ServerSessionResult = 'existing' | 'created' | 'failed';

/** Sign-in and the auth listener both ask at once; one request serves both. */
let pending: { uid: string; result: Promise<ServerSessionResult> } | null = null;

function hasSessionFor(uid: string): boolean {
  return document.cookie
    .split(';')
    .some((part) => part.trim() === `${SESSION_MARKER_COOKIE}=${uid}`);
}

/**
 * Give the server a signed session cookie for this user, if it has none yet.
 * The server trusts nothing else, so sign-in must await this before reloading.
 *
 * @param options.force - create one even if the marker says it exists. For an
 *   explicit sign-in only: the marker can outlive a session the server rejects
 *   (revoked, say), and signing in again has to be able to recover from that.
 *   Never use it from code that reloads the page on its own, or a session the
 *   server keeps refusing would reload forever.
 * @returns 'created' only when the browser really stored the new session, so a
 *   caller that reloads on 'created' cannot loop when cookies are blocked.
 */
export async function establishServerSession(
  user: User,
  { force = false }: { force?: boolean } = {}
): Promise<ServerSessionResult> {
  if (pending?.uid === user.uid) return pending.result;
  if (!force && hasSessionFor(user.uid)) return 'existing';

  const result = createSession(user).finally(() => {
    pending = null;
  });
  pending = { uid: user.uid, result };

  return result;
}

async function createSession(user: User): Promise<ServerSessionResult> {
  try {
    const token = await user.getIdToken();
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.ok && hasSessionFor(user.uid) ? 'created' : 'failed';
  } catch (error) {
    logError(error, { operation: 'serverSession.establishServerSession', userId: user.uid });

    return 'failed';
  }
}

export async function clearServerSession(): Promise<void> {
  try {
    await fetch('/api/auth/session', { method: 'DELETE' });
  } catch (error) {
    logError(error, { operation: 'serverSession.clearServerSession' });
  }
}
