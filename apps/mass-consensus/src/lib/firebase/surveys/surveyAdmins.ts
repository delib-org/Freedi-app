import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import {
  Collections,
  MAX_PENDING_SURVEY_ADMIN_INVITES,
  SURVEY_ADMIN_INVITE_EXPIRY_MS,
  Survey,
  SurveyAdmin,
  SurveyAdminInvitation,
  SurveyAdminInvitationStatus,
  SurveyAdminRole,
  getSurveyAdminId,
} from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import { logger } from '@/lib/utils/logger';

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercase + trim an email, or `null` when it is not a plausible address. */
export function normalizeEmail(email: unknown): string | null {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';

  return normalized && EMAIL_REGEX.test(normalized) ? normalized : null;
}

/** SHA-256 hex digest — what we persist instead of the raw invite token. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Constant-time comparison of two hex digests of equal length. */
export function tokenHashEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Fresh 256-bit URL-safe token plus its stored hash and expiry. */
export function mintInviteToken(now: number): {
  rawToken: string;
  tokenHash: string;
  expiresAt: number;
} {
  const rawToken = randomBytes(32).toString('base64url');

  return {
    rawToken,
    tokenHash: hashToken(rawToken),
    expiresAt: now + SURVEY_ADMIN_INVITE_EXPIRY_MS,
  };
}

/** Absolute URL of the accept-invite screen carrying the raw token. */
export function buildInviteLink(rawToken: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://mc.wizcol.com').replace(/\/$/, '');

  return `${base}/admin/invite?token=${encodeURIComponent(rawToken)}`;
}

// ============================================
// Roster reads
// ============================================

/** Accepted co-admins on a survey, newest grant last. */
export async function listSurveyAdmins(surveyId: string): Promise<SurveyAdmin[]> {
  const db = getFirestoreAdmin();
  const snapshot = await db
    .collection(Collections.surveyAdmins)
    .where('surveyId', '==', surveyId)
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as SurveyAdmin)
    .sort((a, b) => a.addedAt - b.addedAt);
}

/**
 * Invitations on a survey that are still live (pending and unexpired).
 * Expired-but-still-`pending` docs are reported as `expired` without a write —
 * the status is repaired lazily when the invite is next acted on.
 */
export async function listSurveyAdminInvitations(
  surveyId: string
): Promise<SurveyAdminInvitation[]> {
  const db = getFirestoreAdmin();
  const snapshot = await db
    .collection(Collections.surveyAdminInvitations)
    .where('surveyId', '==', surveyId)
    .where('status', '==', SurveyAdminInvitationStatus.pending)
    .get();

  const now = Date.now();

  return snapshot.docs
    .map((doc) => doc.data() as SurveyAdminInvitation)
    .map((invitation) =>
      invitation.expiresAt < now
        ? { ...invitation, status: SurveyAdminInvitationStatus.expired }
        : invitation
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ============================================
// Invite
// ============================================

export interface CreateInvitationInput {
  survey: Survey;
  invitedEmail: string;
  role: SurveyAdminRole;
  inviterUserId: string;
  inviterDisplayName: string;
}

export type CreateInvitationResult =
  | { ok: true; invitation: SurveyAdminInvitation; rawToken: string; inviteLink: string }
  | { ok: false; code: 'already-admin' | 'already-invited' | 'owner' | 'too-many'; message: string };

/**
 * Mint and store a pending invitation. Only the token hash is persisted; the
 * raw token is returned so the caller can email it and show the link.
 *
 * Rejects addresses that already hold access or a live invite, and caps the
 * number of live invites per survey.
 */
export async function createSurveyAdminInvitation(
  input: CreateInvitationInput
): Promise<CreateInvitationResult> {
  const db = getFirestoreAdmin();
  const { survey, invitedEmail, role, inviterUserId, inviterDisplayName } = input;
  const now = Date.now();

  const existingAdmins = await db
    .collection(Collections.surveyAdmins)
    .where('surveyId', '==', survey.surveyId)
    .where('email', '==', invitedEmail)
    .limit(1)
    .get();

  if (!existingAdmins.empty) {
    return {
      ok: false,
      code: 'already-admin',
      message: 'This email already has access to the survey',
    };
  }

  const pending = await db
    .collection(Collections.surveyAdminInvitations)
    .where('surveyId', '==', survey.surveyId)
    .where('status', '==', SurveyAdminInvitationStatus.pending)
    .get();

  const live = pending.docs
    .map((doc) => doc.data() as SurveyAdminInvitation)
    .filter((invitation) => invitation.expiresAt > now);

  if (live.some((invitation) => invitation.invitedEmail === invitedEmail)) {
    return {
      ok: false,
      code: 'already-invited',
      message: 'This email already has a pending invitation',
    };
  }

  if (live.length >= MAX_PENDING_SURVEY_ADMIN_INVITES) {
    return {
      ok: false,
      code: 'too-many',
      message: `A survey cannot have more than ${MAX_PENDING_SURVEY_ADMIN_INVITES} pending invitations`,
    };
  }

  const { rawToken, tokenHash, expiresAt } = mintInviteToken(now);
  const ref = db.collection(Collections.surveyAdminInvitations).doc();

  const invitation: SurveyAdminInvitation = {
    invitationId: ref.id,
    surveyId: survey.surveyId,
    surveyTitle: survey.title,
    invitedEmail,
    invitedBy: inviterUserId,
    invitedByDisplayName: inviterDisplayName,
    role,
    tokenHash,
    status: SurveyAdminInvitationStatus.pending,
    createdAt: now,
    expiresAt,
    acceptedAt: null,
    acceptedByUserId: null,
  };

  await ref.set(invitation);

  logger.info('[surveyAdmins] Invitation created', invitation.invitationId, 'for', invitedEmail);

  return { ok: true, invitation, rawToken, inviteLink: buildInviteLink(rawToken) };
}

// ============================================
// Accept
// ============================================

export interface AcceptorIdentity {
  userId: string;
  email: string;
  displayName: string;
}

export type AcceptInvitationResult =
  | { ok: true; surveyId: string; surveyTitle: string; role: SurveyAdminRole }
  | {
      ok: false;
      code: 'not-found' | 'accepted' | 'revoked' | 'expired' | 'wrong-email' | 'owner';
      message: string;
    };

/**
 * Redeem the raw token from an invite link.
 *
 * The invite is found by token hash, then checked for status, expiry and — the
 * load-bearing check — that the signed-in account's email matches the address
 * the invite was sent to. Without that, anyone holding the link would gain
 * access.
 */
export async function acceptSurveyAdminInvitation(
  rawToken: string,
  acceptor: AcceptorIdentity
): Promise<AcceptInvitationResult> {
  const db = getFirestoreAdmin();

  const snapshot = await db
    .collection(Collections.surveyAdminInvitations)
    .where('tokenHash', '==', hashToken(rawToken))
    .limit(1)
    .get();

  if (snapshot.empty) {
    return { ok: false, code: 'not-found', message: 'This invitation could not be found' };
  }

  const inviteDoc = snapshot.docs[0];
  const invitation = inviteDoc.data() as SurveyAdminInvitation;

  // Defence in depth: the query above already matched on hash equality, but
  // compare in constant time so the branch below cannot be used as an oracle.
  if (!tokenHashEquals(invitation.tokenHash, hashToken(rawToken))) {
    return { ok: false, code: 'not-found', message: 'This invitation could not be found' };
  }

  if (invitation.status === SurveyAdminInvitationStatus.accepted) {
    return { ok: false, code: 'accepted', message: 'This invitation has already been accepted' };
  }

  if (invitation.status === SurveyAdminInvitationStatus.revoked) {
    return { ok: false, code: 'revoked', message: 'This invitation has been cancelled' };
  }

  const now = Date.now();

  if (invitation.expiresAt < now) {
    if (invitation.status !== SurveyAdminInvitationStatus.expired) {
      await inviteDoc.ref.update({ status: SurveyAdminInvitationStatus.expired });
    }

    return { ok: false, code: 'expired', message: 'This invitation has expired' };
  }

  if (invitation.invitedEmail !== acceptor.email.trim().toLowerCase()) {
    return {
      ok: false,
      code: 'wrong-email',
      message: 'This invitation was sent to a different email address',
    };
  }

  const surveyDoc = await db
    .collection(Collections.surveys)
    .doc(invitation.surveyId)
    .get();
  const survey = surveyDoc.exists ? (surveyDoc.data() as Survey) : null;

  if (survey?.creatorId === acceptor.userId) {
    // Already the owner — nothing to grant, but close the invite out.
    await inviteDoc.ref.update({
      status: SurveyAdminInvitationStatus.accepted,
      acceptedAt: now,
      acceptedByUserId: acceptor.userId,
    });

    return { ok: false, code: 'owner', message: 'You already own this survey' };
  }

  const surveyAdminId = getSurveyAdminId(invitation.surveyId, acceptor.userId);
  const adminRef = db.collection(Collections.surveyAdmins).doc(surveyAdminId);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(adminRef);

    const admin: SurveyAdmin = {
      surveyAdminId,
      surveyId: invitation.surveyId,
      userId: acceptor.userId,
      email: invitation.invitedEmail,
      displayName: acceptor.displayName,
      role: invitation.role,
      addedBy: invitation.invitedBy,
      // Re-accepting (e.g. an upgraded role) keeps the original grant date.
      addedAt: existing.exists ? ((existing.data() as SurveyAdmin).addedAt ?? now) : now,
      lastUpdate: now,
    };

    tx.set(adminRef, admin);
    tx.update(inviteDoc.ref, {
      status: SurveyAdminInvitationStatus.accepted,
      acceptedAt: now,
      acceptedByUserId: acceptor.userId,
    });
  });

  logger.info(
    '[surveyAdmins] Invitation accepted',
    invitation.invitationId,
    'by',
    acceptor.userId
  );

  return {
    ok: true,
    surveyId: invitation.surveyId,
    surveyTitle: invitation.surveyTitle,
    role: invitation.role,
  };
}

// ============================================
// Revoke / update / remove
// ============================================

/** Mark a pending invitation as revoked. Returns false when it is not pending. */
export async function revokeSurveyAdminInvitation(
  surveyId: string,
  invitationId: string
): Promise<boolean> {
  const db = getFirestoreAdmin();
  const ref = db.collection(Collections.surveyAdminInvitations).doc(invitationId);
  const doc = await ref.get();

  if (!doc.exists) {
    return false;
  }

  const invitation = doc.data() as SurveyAdminInvitation;

  if (invitation.surveyId !== surveyId) {
    return false;
  }

  if (invitation.status !== SurveyAdminInvitationStatus.pending) {
    return false;
  }

  await ref.update({ status: SurveyAdminInvitationStatus.revoked });

  return true;
}

/** Change an existing co-admin's role. Returns false when there is no such admin. */
export async function updateSurveyAdminRole(
  surveyId: string,
  userId: string,
  role: SurveyAdminRole
): Promise<boolean> {
  const db = getFirestoreAdmin();
  const ref = db.collection(Collections.surveyAdmins).doc(getSurveyAdminId(surveyId, userId));
  const doc = await ref.get();

  if (!doc.exists) {
    return false;
  }

  await ref.update({ role, lastUpdate: Date.now() });

  return true;
}

/** Remove a co-admin's access. Returns false when there is no such admin. */
export async function removeSurveyAdmin(surveyId: string, userId: string): Promise<boolean> {
  const db = getFirestoreAdmin();
  const ref = db.collection(Collections.surveyAdmins).doc(getSurveyAdminId(surveyId, userId));
  const doc = await ref.get();

  if (!doc.exists) {
    return false;
  }

  await ref.delete();

  logger.info('[surveyAdmins] Removed admin', userId, 'from survey', surveyId);

  return true;
}

/** Delete every admin record and invitation for a survey (used on survey delete). */
export async function deleteSurveyAdminRecords(surveyId: string): Promise<void> {
  const db = getFirestoreAdmin();

  const [admins, invitations] = await Promise.all([
    db.collection(Collections.surveyAdmins).where('surveyId', '==', surveyId).get(),
    db.collection(Collections.surveyAdminInvitations).where('surveyId', '==', surveyId).get(),
  ]);

  const docs = [...admins.docs, ...invitations.docs];

  if (docs.length === 0) {
    return;
  }

  const batch = db.batch();
  docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

/**
 * Surveys the user can reach through a `surveyAdmins` record — i.e. surveys
 * they did not create but were invited to co-administer. Returned alongside
 * the caller's role so the list UI can label them.
 */
export async function getSurveysSharedWithUser(
  userId: string
): Promise<{ surveys: Survey[]; rolesBySurveyId: Record<string, SurveyAdminRole> }> {
  const db = getFirestoreAdmin();
  const adminDocs = await db
    .collection(Collections.surveyAdmins)
    .where('userId', '==', userId)
    .get();

  if (adminDocs.empty) {
    return { surveys: [], rolesBySurveyId: {} };
  }

  const rolesBySurveyId: Record<string, SurveyAdminRole> = {};
  adminDocs.docs.forEach((doc) => {
    const admin = doc.data() as SurveyAdmin;
    rolesBySurveyId[admin.surveyId] = admin.role;
  });

  const ids = Object.keys(rolesBySurveyId);
  const surveys: Survey[] = [];

  // getAll has no documented cap but chunk anyway to keep each read bounded.
  const chunkSize = 100;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const refs = ids
      .slice(i, i + chunkSize)
      .map((id) => db.collection(Collections.surveys).doc(id));
    const docs = await db.getAll(...refs);

    docs.forEach((doc) => {
      if (doc.exists) {
        surveys.push(doc.data() as Survey);
      } else {
        // The survey was deleted but its roster row outlived it.
        delete rolesBySurveyId[doc.id];
      }
    });
  }

  return { surveys, rolesBySurveyId };
}
