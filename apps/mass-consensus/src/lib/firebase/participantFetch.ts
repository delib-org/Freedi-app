import { ensureSignedInUser, getCurrentToken } from './client';

const STATUS_UNAUTHORIZED = 401;

async function withAuthorization(init: RequestInit | undefined, token: string | null): Promise<RequestInit> {
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return { ...init, headers };
}

/**
 * `fetch` for participant API routes: attaches the caller's Firebase ID token,
 * the only proof of identity those routes accept.
 *
 * Visitors with no account are signed in anonymously first, so no signup is
 * ever needed. The token comes from the SDK's cache, so this adds no network
 * round trip to a vote. A 401 means the held token was rejected, so it is
 * replaced once.
 */
export async function participantFetch(input: string, init?: RequestInit): Promise<Response> {
  await ensureSignedInUser();
  const token = await getCurrentToken();
  const response = await fetch(input, await withAuthorization(init, token));
  if (response.status !== STATUS_UNAUTHORIZED) return response;

  const freshToken = await getCurrentToken({ force: true });
  if (!freshToken) return response;

  return fetch(input, await withAuthorization(init, freshToken));
}
