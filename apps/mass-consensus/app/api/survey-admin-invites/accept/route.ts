import { NextRequest, NextResponse } from 'next/server';
import { acceptSurveyAdminInvitation } from '@/lib/firebase/surveys';
import { verifyIdentity, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { logError } from '@/lib/utils/errorHandling';

/** HTTP status for each way an acceptance can fail. */
const STATUS_BY_CODE: Record<string, number> = {
  'not-found': 404,
  accepted: 409,
  revoked: 403,
  expired: 410,
  'wrong-email': 403,
  owner: 409,
};

/**
 * POST /api/survey-admin-invites/accept
 * Redeem an invitation token. The caller must be signed in with the same email
 * address the invitation was sent to.
 * Body: { token: string }
 */
export async function POST(request: NextRequest) {
  try {
    const authToken = extractBearerToken(request.headers.get('authorization'));

    if (!authToken) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const identity = await verifyIdentity(authToken);

    if (!identity) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    if (!identity.email) {
      return NextResponse.json(
        {
          error:
            'Sign in with an account that has an email address to accept this invitation',
        },
        { status: 403 }
      );
    }

    const body = (await request.json()) as { token?: unknown };
    const inviteToken = typeof body.token === 'string' ? body.token.trim() : '';

    if (!inviteToken) {
      return NextResponse.json({ error: 'Missing invitation token' }, { status: 400 });
    }

    const result = await acceptSurveyAdminInvitation(inviteToken, {
      userId: identity.userId,
      email: identity.email,
      displayName: identity.displayName,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: STATUS_BY_CODE[result.code] ?? 400 }
      );
    }

    return NextResponse.json({
      success: true,
      surveyId: result.surveyId,
      surveyTitle: result.surveyTitle,
      role: result.role,
    });
  } catch (error) {
    logError(error, { operation: 'api.surveyAdminInvites.accept' });

    return NextResponse.json({ error: 'Failed to accept invitation' }, { status: 500 });
  }
}
