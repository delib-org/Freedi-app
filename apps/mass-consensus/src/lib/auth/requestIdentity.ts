import { NextRequest, NextResponse } from 'next/server';
import { getAnonymousDisplayName } from '@/lib/utils/user';
import { extractBearerToken, verifyParticipantToken } from './verifyAdmin';

const STATUS_UNAUTHORIZED = 401;

/**
 * The caller of a participant API route, as proven by a Firebase ID token.
 *
 * Every participant holds one: visitors who never sign in are signed in
 * anonymously by AuthProvider. Evaluating other people's options therefore
 * needs no signup, but nobody can act under a uid they cannot prove is theirs.
 */
export interface VerifiedParticipant {
  userId: string;
  displayName: string;
}

/**
 * Verify the request's ID token. This is the only source of identity for
 * participant routes: a `userId` in the body, query string or a cookie is
 * attacker-controlled and must never be read.
 *
 * Verification is a local signature check with no network round trip (no
 * `checkRevoked`), so it is safe to run on the voting path.
 */
export async function verifyParticipant(request: NextRequest): Promise<VerifiedParticipant | null> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return null;

  const verified = await verifyParticipantToken(token);
  if (!verified) return null;

  return {
    userId: verified.userId,
    displayName: verified.name || getAnonymousDisplayName(verified.userId),
  };
}

export async function getVerifiedUserId(request: NextRequest): Promise<string | null> {
  const participant = await verifyParticipant(request);

  return participant?.userId ?? null;
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'Authentication required' }, { status: STATUS_UNAUTHORIZED });
}
