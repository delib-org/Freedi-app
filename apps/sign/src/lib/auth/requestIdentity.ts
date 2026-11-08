/**
 * Who is making this request, as far as the server can prove it.
 *
 * Design: Sign renders its admin pages on the server, so a Bearer token alone
 * cannot work (a page load has no Authorization header). A signed Firebase
 * session cookie (`__session`, as in apps/chat/src/hooks.server.ts) is minted
 * from the client's ID token and verified here. Bearer ID tokens are accepted
 * too, for API calls that already send one.
 *
 * Two tiers, and the difference matters:
 * - Verified: proven by Firebase. The only identity allowed on admin,
 *   collaborator and settings paths, and the only uid checkAdminAccess may see.
 * - Participant: verified, or else the middleware's `_uid` cookie when it holds
 *   a server-minted `anon_...` id. That cookie is unsigned, so it is accepted
 *   only in the `anon_` shape: it can never be a real account's uid, and it
 *   only ever reaches low-privilege actions on public documents.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Firestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { verifyAuthHeader, verifySessionCookieValue, VerifiedUser } from '@/lib/firebase/admin';
import { checkAdminAccess, checkDocumentAccess } from '@/lib/utils/adminAccess';
import { getAnonymousDisplayName, SignUser } from '@/lib/utils/user';
import { SECURE_UID_COOKIE, SESSION_COOKIE } from './sessionCookies';

const SERVER_MINTED_ANON_ID = /^anon_\d+_[a-z0-9]+$/;
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;

export interface ParticipantIdentity {
  uid: string;
  email: string | null;
  /** From the verified token; null for a server-minted anonymous visitor. */
  displayName: string | null;
  isAnonymous: boolean;
  /** False only for a server-minted `anon_` visitor. */
  verified: boolean;
}

export interface VerifyOptions {
  /** Also ask Firebase whether the session was revoked (network call; admin paths). */
  checkRevoked?: boolean;
}

export function isServerMintedAnonymousId(value: string | null | undefined): value is string {
  return typeof value === 'string' && SERVER_MINTED_ANON_ID.test(value);
}

/** One verification per request, however many helpers ask. */
const verifiedByRequest = {
  revocationChecked: new WeakMap<NextRequest, Promise<VerifiedUser | null>>(),
  localOnly: new WeakMap<NextRequest, Promise<VerifiedUser | null>>(),
};

async function verifyRequest(request: NextRequest, checkRevoked: boolean): Promise<VerifiedUser | null> {
  const bearerUser = await verifyAuthHeader(request.headers.get('authorization'), checkRevoked);
  if (bearerUser) return bearerUser;

  return verifySessionCookieValue(request.cookies.get(SESSION_COOKIE)?.value, checkRevoked);
}

export function getVerifiedIdentity(
  request: NextRequest,
  { checkRevoked = false }: VerifyOptions = {}
): Promise<VerifiedUser | null> {
  const cache = checkRevoked ? verifiedByRequest.revocationChecked : verifiedByRequest.localOnly;
  let verified = cache.get(request);
  if (!verified) {
    verified = verifyRequest(request, checkRevoked);
    cache.set(request, verified);
  }

  return verified;
}

/**
 * For admin, collaborator and settings paths. Never returns an anonymous
 * cookie id: only a uid Firebase has proven.
 */
export async function getVerifiedUserId(request: NextRequest): Promise<string | null> {
  const identity = await getVerifiedIdentity(request, { checkRevoked: true });

  return identity?.uid ?? null;
}

export async function getVerifiedDisplayName(request: NextRequest): Promise<string | null> {
  const identity = await getVerifiedIdentity(request, { checkRevoked: true });

  return identity?.displayName ?? null;
}

/** For low-privilege participant actions on public documents. */
export async function getParticipantIdentity(request: NextRequest): Promise<ParticipantIdentity | null> {
  const verified = await getVerifiedIdentity(request);
  if (verified) return { ...verified, verified: true };

  const cookieId = request.cookies.get(SECURE_UID_COOKIE)?.value;
  if (!isServerMintedAnonymousId(cookieId)) return null;

  return { uid: cookieId, email: null, displayName: null, isAnonymous: true, verified: false };
}

export async function getParticipantId(request: NextRequest): Promise<string | null> {
  const identity = await getParticipantIdentity(request);

  return identity?.uid ?? null;
}

export async function getParticipantDisplayName(request: NextRequest): Promise<string | null> {
  const identity = await getParticipantIdentity(request);

  return identity?.displayName ?? null;
}

/** True unless Firebase proved a real (non-anonymous) account. */
export async function isAnonymousParticipant(request: NextRequest): Promise<boolean> {
  const identity = await getParticipantIdentity(request);

  return !identity || identity.isAnonymous;
}

/**
 * checkAdminAccess for a participant route: an unverified visitor is never an
 * admin, so their cookie id must not reach the check at all.
 */
export async function isVerifiedDocumentAdmin(
  db: Firestore,
  documentId: string,
  identity: ParticipantIdentity | null
): Promise<boolean> {
  if (!identity?.verified) return false;

  return (await checkAdminAccess(db, documentId, identity.uid)).isAdmin;
}

interface DocumentVisibility {
  signSettings?: { isPublic?: boolean; isHidden?: boolean };
}

/**
 * The same access rule the document page enforces, for the APIs that return or
 * change the same content. Hidden: admins only. Private: real signed-in members.
 */
export async function canAccessDocument(
  db: Firestore,
  documentId: string,
  identity: ParticipantIdentity | null
): Promise<boolean> {
  const snapshot = await db.collection(Collections.statements).doc(documentId).get();
  if (!snapshot.exists) return false;

  const settings = (snapshot.data() as DocumentVisibility).signSettings;
  if (settings?.isHidden === true) return isVerifiedDocumentAdmin(db, documentId, identity);
  if (settings?.isPublic !== false) return true;
  if (!identity?.verified || identity.isAnonymous) return false;

  return checkDocumentAccess(db, documentId, identity.uid);
}

/** @returns A 401 or 403 response when the caller may not use this document, otherwise null. */
export async function denyWithoutDocumentAccess(
  db: Firestore,
  documentId: string,
  identity: ParticipantIdentity | null
): Promise<NextResponse | null> {
  if (await canAccessDocument(db, documentId, identity)) return null;

  return identity?.verified
    ? NextResponse.json({ error: 'You do not have access to this document' }, { status: STATUS_FORBIDDEN })
    : NextResponse.json({ error: 'Sign in to access this document' }, { status: STATUS_UNAUTHORIZED });
}

/**
 * The caller's Authorization header for forwarding to a Cloud Function, only
 * when it holds a token for the already-verified user.
 */
export async function getForwardableAuthorization(
  request: NextRequest,
  userId: string
): Promise<string | null> {
  const authorization = request.headers.get('authorization');
  const tokenUser = await verifyAuthHeader(authorization);

  return tokenUser?.uid === userId ? authorization : null;
}

interface CookieReader {
  get: (name: string) => { value: string } | undefined;
}

export interface ServerSignUser extends SignUser {
  email: string | null;
  verified: boolean;
}

/** The caller of a server-rendered page. Same two tiers as the API helpers. */
export async function getServerUser(cookieStore: CookieReader): Promise<ServerSignUser | null> {
  const verified = await verifySessionCookieValue(cookieStore.get(SESSION_COOKIE)?.value, false);
  if (verified) {
    return {
      uid: verified.uid,
      displayName: verified.displayName ?? getAnonymousDisplayName(verified.uid),
      isAnonymous: verified.isAnonymous,
      email: verified.email,
      verified: true,
    };
  }

  const cookieId = cookieStore.get(SECURE_UID_COOKIE)?.value;
  if (!isServerMintedAnonymousId(cookieId)) return null;

  return {
    uid: cookieId,
    displayName: getAnonymousDisplayName(cookieId),
    isAnonymous: true,
    email: null,
    verified: false,
  };
}
