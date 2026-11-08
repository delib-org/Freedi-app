import type { User } from 'firebase/auth';
import { SESSION_MARKER_COOKIE } from '@/lib/auth/sessionCookies';
import { logError } from '@/lib/utils/errorHandling';

/** Sign-in and the auth listener both ask at once; one request serves both. */
let pending: { uid: string; result: Promise<boolean> } | null = null;

function hasSessionFor(uid: string): boolean {
  return document.cookie
    .split(';')
    .some((part) => part.trim() === `${SESSION_MARKER_COOKIE}=${uid}`);
}

/**
 * Give the server a signed session cookie for this user, if it has none yet.
 *
 * Runs in the background and at most once per session lifetime, so it never
 * sits on the path of a vote.
 *
 * @returns True when a new session was created just now.
 */
export async function establishServerSession(user: User): Promise<boolean> {
  if (pending?.uid === user.uid) return pending.result;
  if (hasSessionFor(user.uid)) return false;

  const result = createSession(user).finally(() => {
    pending = null;
  });
  pending = { uid: user.uid, result };

  return result;
}

async function createSession(user: User): Promise<boolean> {
  try {
    const token = await user.getIdToken();
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    // Checking the marker keeps a caller that reloads from looping when cookies are blocked.
    return response.ok && hasSessionFor(user.uid);
  } catch (error) {
    logError(error, { operation: 'serverSession.establishServerSession', userId: user.uid });

    return false;
  }
}

export async function clearServerSession(): Promise<void> {
  try {
    await fetch('/api/auth/session', { method: 'DELETE' });
  } catch (error) {
    logError(error, { operation: 'serverSession.clearServerSession' });
  }
}
