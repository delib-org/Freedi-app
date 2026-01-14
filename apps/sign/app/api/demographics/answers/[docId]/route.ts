import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import {
  getUserDemographicAnswers,
  saveUserDemographicAnswers,
  saveSurveyAcknowledgement,
} from '@/lib/firebase/demographicQueries';
import {
  DemographicMode,
  SaveAnswersRequest,
  DemographicAnswersResponse,
} from '@/types/demographics';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/demographics/answers/[docId]
 * Returns user's demographic answers for a document
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
  try {
    const { docId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
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

    // Get user's answers
    const answers = await getUserDemographicAnswers(docId, userId, topParentId, mode);

    const response: DemographicAnswersResponse = {
      answers,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('[API] Demographics answers GET failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/demographics/answers/[docId]
 * Save user's demographic answers
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
  try {
    const { docId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
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

    if (mode === 'disabled') {
      return NextResponse.json(
        { error: 'Demographics are disabled for this document' },
        { status: 400 }
      );
    }

    // Parse request body
    const body: SaveAnswersRequest = await request.json();

    // Answers can be empty (user dismissing optional survey or submitting without answers)
    const answers = body.answers || [];

    // Validate answers if any provided
    for (const answer of answers) {
      if (!answer.userQuestionId) {
        return NextResponse.json(
          { error: 'Each answer must have a userQuestionId' },
          { status: 400 }
        );
      }
    }

    // Save the answers (if any)
    if (answers.length > 0) {
      await saveUserDemographicAnswers(docId, userId, topParentId, answers);
    }

    // Save acknowledgement that user has submitted/dismissed the survey
    await saveSurveyAcknowledgement(docId, userId, topParentId);

    console.info(`[API] Saved ${answers.length} answers for user ${userId} on document ${docId}`);

    return NextResponse.json({
      success: true,
      savedCount: answers.length,
    });
  } catch (error) {
    logger.error('[API] Demographics answers POST failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
