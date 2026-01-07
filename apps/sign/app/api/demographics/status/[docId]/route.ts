import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import { checkSurveyCompletion } from '@/lib/firebase/demographicQueries';
import { DemographicMode, SurveyTriggerMode, DemographicStatusResponse } from '@/types/demographics';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/demographics/status/[docId]
 * Returns survey completion status for the current user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
  try {
    const { docId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      // Return complete status for anonymous users (they'll be prompted to login if required)
      return NextResponse.json({
        status: {
          isComplete: true,
          totalQuestions: 0,
          answeredQuestions: 0,
          isRequired: false,
          missingQuestionIds: [],
          surveyTrigger: 'on_interaction' as SurveyTriggerMode,
        },
        mode: 'disabled' as DemographicMode,
      });
    }

    const { db } = getFirebaseAdmin();

    // Get the document to check settings
    const docRef = db.collection(Collections.statements).doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const document = docSnap.data();
    const topParentId = document?.topParentId || docId;
    const signSettings = document?.signSettings || {};

    const mode: DemographicMode = signSettings.demographicMode || 'disabled';
    const required = signSettings.demographicRequired || false;
    const surveyTrigger: SurveyTriggerMode = signSettings.surveyTrigger || 'on_interaction';

    // Check completion status
    const status = await checkSurveyCompletion(
      docId,
      userId,
      mode,
      topParentId,
      required
    );

    // Add surveyTrigger to the status
    const statusWithTrigger = {
      ...status,
      surveyTrigger,
    };

    const response: DemographicStatusResponse = {
      status: statusWithTrigger,
      mode,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('[API] Demographics status GET failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
