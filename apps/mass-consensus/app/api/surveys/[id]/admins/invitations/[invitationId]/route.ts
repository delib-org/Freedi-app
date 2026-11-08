import { NextRequest, NextResponse } from 'next/server';
import { revokeSurveyAdminInvitation } from '@/lib/firebase/surveys';
import { requireSurveyAccess } from '@/lib/auth/surveyAccess';
import { logError } from '@/lib/utils/errorHandling';

interface RouteContext {
  params: Promise<{ id: string; invitationId: string }>;
}

/**
 * DELETE /api/surveys/[id]/admins/invitations/[invitationId]
 * Cancel a pending invitation so its link stops working. Owner only.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: surveyId, invitationId } = await context.params;
    const result = await requireSurveyAccess(request, surveyId, 'manageAdmins');

    if (!result.ok) {
      return result.response;
    }

    const revoked = await revokeSurveyAdminInvitation(surveyId, invitationId);

    if (!revoked) {
      return NextResponse.json(
        { error: 'No pending invitation with that id on this survey' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { operation: 'api.surveys.admins.invitations.DELETE' });

    return NextResponse.json({ error: 'Failed to cancel invitation' }, { status: 500 });
  }
}
