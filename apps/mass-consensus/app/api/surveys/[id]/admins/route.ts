import { NextRequest, NextResponse } from 'next/server';
import {
  INVITABLE_SURVEY_ADMIN_ROLES,
  SurveyAdminRole,
} from '@freedi/shared-types';
import {
  createSurveyAdminInvitation,
  listSurveyAdminInvitations,
  listSurveyAdmins,
  normalizeEmail,
} from '@/lib/firebase/surveys';
import { requireSurveyAccess } from '@/lib/auth/surveyAccess';
import { verifyIdentity, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { sendSurveyAdminInvitationEmail } from '@/lib/email/surveyAdminInvitationEmail';
import { logger } from '@/lib/utils/logger';
import { logError } from '@/lib/utils/errorHandling';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/surveys/[id]/admins
 * The survey's admin roster: the owner, accepted co-admins, and pending
 * invitations. Anyone with access may read it, so a viewer can see who else
 * is on the survey; only the owner may change it.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: surveyId } = await context.params;
    const result = await requireSurveyAccess(request, surveyId, 'view');

    if (!result.ok) {
      return result.response;
    }

    const [admins, invitations] = await Promise.all([
      listSurveyAdmins(surveyId),
      result.access.canManageAdmins
        ? listSurveyAdminInvitations(surveyId)
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      ownerId: result.survey.creatorId,
      access: result.access,
      admins,
      // Pending invitations name people who have not accepted yet, so they are
      // shown to the owner only.
      invitations: invitations.map((invitation) => ({
        invitationId: invitation.invitationId,
        invitedEmail: invitation.invitedEmail,
        role: invitation.role,
        status: invitation.status,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      })),
    });
  } catch (error) {
    logError(error, { operation: 'api.surveys.admins.GET' });

    return NextResponse.json({ error: 'Failed to load survey admins' }, { status: 500 });
  }
}

/**
 * POST /api/surveys/[id]/admins
 * Invite an email address to co-administer the survey. Owner only.
 * Body: { email: string, role: 'admin-viewer' | 'admin-edit' }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: surveyId } = await context.params;
    const result = await requireSurveyAccess(request, surveyId, 'manageAdmins');

    if (!result.ok) {
      return result.response;
    }

    const body = (await request.json()) as { email?: unknown; role?: unknown };
    const email = normalizeEmail(body.email);

    if (!email) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
    }

    const role = body.role as SurveyAdminRole;

    if (!INVITABLE_SURVEY_ADMIN_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'role must be admin-viewer or admin-edit' },
        { status: 400 }
      );
    }

    // The identity is re-read here for the inviter's display name; the access
    // check above has already authorised the call.
    const token = extractBearerToken(request.headers.get('authorization'));
    const identity = token ? await verifyIdentity(token) : null;

    if (identity?.email === email) {
      return NextResponse.json(
        { error: 'You already own this survey' },
        { status: 409 }
      );
    }

    const created = await createSurveyAdminInvitation({
      survey: result.survey,
      invitedEmail: email,
      role,
      inviterUserId: result.userId,
      inviterDisplayName: identity?.displayName ?? 'A Freedi admin',
    });

    if (!created.ok) {
      return NextResponse.json({ error: created.message }, { status: 409 });
    }

    const emailSent = await sendSurveyAdminInvitationEmail({
      to: email,
      inviteLink: created.inviteLink,
      role,
      inviterName: identity?.displayName ?? 'A Freedi admin',
      surveyTitle: result.survey.title,
      expiresAt: created.invitation.expiresAt,
      language: result.survey.defaultLanguage,
    });

    logger.info(
      '[POST /api/surveys/[id]/admins] Invited',
      email,
      'as',
      role,
      'emailSent:',
      emailSent
    );

    return NextResponse.json(
      {
        invitation: {
          invitationId: created.invitation.invitationId,
          invitedEmail: created.invitation.invitedEmail,
          role: created.invitation.role,
          status: created.invitation.status,
          createdAt: created.invitation.createdAt,
          expiresAt: created.invitation.expiresAt,
        },
        // Returned so the owner can share the link manually when mail is not
        // configured or delivery fails.
        inviteLink: created.inviteLink,
        emailSent,
      },
      { status: 201 }
    );
  } catch (error) {
    logError(error, { operation: 'api.surveys.admins.POST' });

    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
  }
}
