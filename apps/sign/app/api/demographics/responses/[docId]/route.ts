import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import { getDemographicQuestions } from '@/lib/firebase/demographicQueries';
import { DemographicMode, SignDemographicQuestion } from '@/types/demographics';
import { logger } from '@/lib/utils/logger';

interface UserResponse {
  odlUserId: string;
  answers: Record<string, string | string[] | undefined>;
  submittedAt?: number;
}

interface DemographicResponsesData {
  questions: SignDemographicQuestion[];
  responses: UserResponse[];
  totalResponses: number;
}

/**
 * GET /api/demographics/responses/[docId]
 * Returns all demographic responses for a document (admin only)
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

    // Get the document to verify admin
    const docRef = db.collection(Collections.statements).doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const document = docSnap.data();
    const isAdmin = document?.creator?.odlUserId === userId || document?.creatorId === userId;

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const topParentId = document?.topParentId || docId;
    const signSettings = document?.signSettings || {};
    const mode: DemographicMode = signSettings.demographicMode || 'disabled';

    if (mode === 'disabled') {
      return NextResponse.json({
        questions: [],
        responses: [],
        totalResponses: 0,
      });
    }

    // Get questions
    const questions = await getDemographicQuestions(docId, mode, topParentId);

    if (questions.length === 0) {
      return NextResponse.json({
        questions: [],
        responses: [],
        totalResponses: 0,
      });
    }

    // Get all responses for these questions
    const questionIds = questions
      .map((q) => q.userQuestionId)
      .filter(Boolean) as string[];

    // Query usersData for answers to these questions
    const responsesMap = new Map<string, UserResponse>();

    for (const questionId of questionIds) {
      // Query answers for this question (pattern: {questionId}--{userId})
      const answersSnapshot = await db
        .collection(Collections.usersData)
        .where('userQuestionId', '==', questionId)
        .get();

      answersSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const odlUserId = data.odlUserId || data.userId;

        if (!odlUserId) return;

        if (!responsesMap.has(odlUserId)) {
          responsesMap.set(odlUserId, {
            odlUserId,
            answers: {},
          });
        }

        const userResponse = responsesMap.get(odlUserId)!;
        if (data.answer) {
          userResponse.answers[questionId] = data.answer;
        } else if (data.answerOptions && data.answerOptions.length > 0) {
          userResponse.answers[questionId] = data.answerOptions;
        }
      });
    }

    const responses = Array.from(responsesMap.values());

    const responseData: DemographicResponsesData = {
      questions,
      responses,
      totalResponses: responses.length,
    };

    console.info(`[API] Returning ${responses.length} demographic responses for document ${docId}`);

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error('[API] Demographics responses GET failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
