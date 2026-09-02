import { getCurrentToken } from '@/lib/firebase/client';

/**
 * Thrown when there is no signed-in user to get a token for, or when a token
 * minted seconds ago is still rejected. Callers should send the visitor to
 * login rather than surfacing this as a failure of whatever they were doing.
 */
export class NotAuthenticatedError extends Error {
  constructor(message = 'Not authenticated') {
    super(message);
    this.name = 'NotAuthenticatedError';
  }
}

function withAuth(init: RequestInit | undefined, token: string): RequestInit {
  return {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  };
}

/**
 * fetch() against our own API routes, with the Firebase ID token attached.
 *
 * Retries exactly once on a 401 with a force-refreshed token. A poll that runs
 * longer than a token's lifetime — survey synthesis is the one that bit us —
 * would otherwise start failing partway through with auth/id-token-expired,
 * and every one of those 401s landed in Sentry as if the endpoint were broken.
 *
 * One retry only: if a token minted moments ago is still refused, the problem
 * is authorization or a revoked session, and hammering the endpoint will not
 * fix either.
 */
export async function authedFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getCurrentToken();
  if (!token) throw new NotAuthenticatedError();

  const response = await fetch(input, withAuth(init, token));
  if (response.status !== 401) return response;

  const freshToken = await getCurrentToken({ force: true });
  if (!freshToken || freshToken === token) {
    throw new NotAuthenticatedError('Session expired');
  }

  const retried = await fetch(input, withAuth(init, freshToken));
  if (retried.status === 401) {
    throw new NotAuthenticatedError('Session expired');
  }

  return retried;
}
