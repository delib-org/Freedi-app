import { NextRequest, NextResponse } from 'next/server';
import {
  Collections,
  Survey,
  SurveyAccess,
  SurveyAdmin,
  SurveyAdminRole,
  buildSurveyAccess,
  getSurveyAdminId,
} from '@freedi/shared-types';
import { getFirestoreAdmin } from '../firebase/admin';
import { getSurveyById } from '../firebase/surveys';
import { logError } from '../utils/errorHandling';
import { verifyToken, extractBearerToken } from './verifyAdmin';

/**
 * Resolve what `userId` may do on `survey`.
 *
 * Ownership (`survey.creatorId`) wins outright; otherwise a `surveyAdmins`
 * record grants `editor` or `viewer`. Returns `null` when the user has no
 * access at all.
 */
export async function resolveSurveyAccess(
  survey: Survey,
  userId: string
): Promise<SurveyAccess | null> {
  if (survey.creatorId === userId) {
    return buildSurveyAccess('owner');
  }

  try {
    const db = getFirestoreAdmin();
    const adminDoc = await db
      .collection(Collections.surveyAdmins)
      .doc(getSurveyAdminId(survey.surveyId, userId))
      .get();

    if (!adminDoc.exists) {
      return null;
    }

    const admin = adminDoc.data() as SurveyAdmin;

    return buildSurveyAccess(
      admin.role === SurveyAdminRole.editor ? 'editor' : 'viewer'
    );
  } catch (error) {
    logError(error, {
      operation: 'surveyAccess.resolveSurveyAccess',
      userId,
      metadata: { surveyId: survey.surveyId },
    });

    // Fail closed — an unreadable roster must never widen access.
    return null;
  }
}

/** What a caller must be able to do for the route to proceed. */
export type SurveyPermission = 'view' | 'edit' | 'manageAdmins';

interface SurveyAccessSuccess {
  ok: true;
  userId: string;
  survey: Survey;
  access: SurveyAccess;
}

interface SurveyAccessFailure {
  ok: false;
  response: NextResponse;
}

export type SurveyAccessResult = SurveyAccessSuccess | SurveyAccessFailure;

const DENIAL_MESSAGE: Record<SurveyPermission, string> = {
  view: 'You do not have access to this survey',
  edit: 'You have view-only access to this survey',
  manageAdmins: 'Only the survey owner can manage its admins',
};

/**
 * The single gate every survey admin API route goes through: verifies the
 * bearer token, loads the survey, resolves the caller's access and checks it
 * covers `permission`.
 *
 * On failure it returns a ready-to-send `NextResponse` so the route can
 * `if (!result.ok) return result.response;` without restating status codes.
 * A user without access gets 404, not 403, so the endpoint does not confirm
 * that a survey id exists to someone who cannot see it.
 */
export async function requireSurveyAccess(
  request: NextRequest,
  surveyId: string,
  permission: SurveyPermission
): Promise<SurveyAccessResult> {
  const token = extractBearerToken(request.headers.get('authorization'));

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authorization required' }, { status: 401 }),
    };
  }

  const userId = await verifyToken(token);

  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }),
    };
  }

  const survey = await getSurveyById(surveyId);

  if (!survey) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Survey not found' }, { status: 404 }),
    };
  }

  const access = await resolveSurveyAccess(survey, userId);

  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Survey not found' }, { status: 404 }),
    };
  }

  const granted =
    permission === 'view' ||
    (permission === 'edit' && access.canEdit) ||
    (permission === 'manageAdmins' && access.canManageAdmins);

  if (!granted) {
    return {
      ok: false,
      response: NextResponse.json({ error: DENIAL_MESSAGE[permission] }, { status: 403 }),
    };
  }

  return { ok: true, userId, survey, access };
}

/**
 * Guard for routes that have already loaded the survey and verified the token.
 *
 * Returns `null` when the caller may proceed, or a ready-to-send error response
 * when they may not. Written as a drop-in for the `survey.creatorId !== userId`
 * checks these routes used before co-admins existed:
 *
 * ```ts
 * const denied = await denySurveyPermission(survey, userId, 'edit');
 * if (denied) return denied;
 * ```
 */
export async function denySurveyPermission(
  survey: Survey,
  userId: string,
  permission: SurveyPermission
): Promise<NextResponse | null> {
  const access = await resolveSurveyAccess(survey, userId);

  if (!access) {
    // Do not confirm the survey exists to someone with no access to it.
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
  }

  const granted =
    permission === 'view' ||
    (permission === 'edit' && access.canEdit) ||
    (permission === 'manageAdmins' && access.canManageAdmins);

  if (granted) {
    return null;
  }

  return NextResponse.json({ error: DENIAL_MESSAGE[permission] }, { status: 403 });
}

/**
 * Survey ids the user can reach through a `surveyAdmins` record (i.e. surveys
 * they did not create but were invited to).
 */
export async function getSurveyIdsWithAdminAccess(userId: string): Promise<string[]> {
  try {
    const db = getFirestoreAdmin();
    const snapshot = await db
      .collection(Collections.surveyAdmins)
      .where('userId', '==', userId)
      .get();

    return snapshot.docs.map((doc) => (doc.data() as SurveyAdmin).surveyId);
  } catch (error) {
    logError(error, {
      operation: 'surveyAccess.getSurveyIdsWithAdminAccess',
      userId,
    });

    return [];
  }
}
