import { NextRequest, NextResponse } from 'next/server';
import { INVITABLE_SURVEY_ADMIN_ROLES, SurveyAdminRole } from '@freedi/shared-types';
import { removeSurveyAdmin, updateSurveyAdminRole } from '@/lib/firebase/surveys';
import { requireSurveyAccess } from '@/lib/auth/surveyAccess';
import { logger } from '@/lib/utils/logger';
import { logError } from '@/lib/utils/errorHandling';

interface RouteContext {
  params: Promise<{ id: string; userId: string }>;
}

/**
 * PATCH /api/surveys/[id]/admins/[userId]
 * Change a co-admin's role between admin-viewer and admin-edit. Owner only.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: surveyId, userId } = await context.params;
    const result = await requireSurveyAccess(request, surveyId, 'manageAdmins');

    if (!result.ok) {
      return result.response;
    }

    const body = (await request.json()) as { role?: unknown };
    const role = body.role as SurveyAdminRole;

    if (!INVITABLE_SURVEY_ADMIN_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'role must be admin-viewer or admin-edit' },
        { status: 400 }
      );
    }

    const updated = await updateSurveyAdminRole(surveyId, userId, role);

    if (!updated) {
      return NextResponse.json({ error: 'Admin not found on this survey' }, { status: 404 });
    }

    logger.info('[PATCH /api/surveys/[id]/admins/[userId]] Role set to', role, 'for', userId);

    return NextResponse.json({ success: true, role });
  } catch (error) {
    logError(error, { operation: 'api.surveys.admins.PATCH' });

    return NextResponse.json({ error: 'Failed to update admin role' }, { status: 500 });
  }
}

/**
 * DELETE /api/surveys/[id]/admins/[userId]
 * Revoke a co-admin's access. Owner only.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: surveyId, userId } = await context.params;
    const result = await requireSurveyAccess(request, surveyId, 'manageAdmins');

    if (!result.ok) {
      return result.response;
    }

    const removed = await removeSurveyAdmin(surveyId, userId);

    if (!removed) {
      return NextResponse.json({ error: 'Admin not found on this survey' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { operation: 'api.surveys.admins.DELETE' });

    return NextResponse.json({ error: 'Failed to remove admin' }, { status: 500 });
  }
}
