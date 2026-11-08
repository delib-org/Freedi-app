import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedUserId, unauthorizedResponse } from '@/lib/auth/requestIdentity';
import {
  saveSurveyDemographicAnswers,
  getSurveyDemographicAnswers,
  getSurveyById,
} from '@/lib/firebase/surveys';
import { logger } from '@/lib/utils/logger';

interface RouteContext {
  params: { id: string; pageId: string };
}

interface SaveAnswersRequest {
  answers: Array<{
    questionId: string;
    answer?: string;
    answerOptions?: string[];
    otherText?: string;
  }>;
}

/**
 * GET /api/surveys/[id]/demographics/[pageId]/answers - Get user's demographic answers
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const surveyId = context.params.id;
    const userId = await getVerifiedUserId(request);

    if (!userId) {
      return unauthorizedResponse();
    }

    const answers = await getSurveyDemographicAnswers(surveyId, userId);

    return NextResponse.json({ answers });
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/demographics/[pageId]/answers] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch answers' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/surveys/[id]/demographics/[pageId]/answers - Save user's demographic answers
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const surveyId = context.params.id;
    const pageId = context.params.pageId;
    const userId = await getVerifiedUserId(request);

    logger.info(`[POST answers] surveyId: ${surveyId}, pageId: ${pageId}`);

    if (!userId) {
      return unauthorizedResponse();
    }

    // Verify survey exists
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }

    const body: SaveAnswersRequest = await request.json();

    if (!body.answers || !Array.isArray(body.answers)) {
      return NextResponse.json(
        { error: 'answers array is required' },
        { status: 400 }
      );
    }

    // Check if survey is in test mode
    const isTestMode = survey.isTestMode === true;

    const savedAnswers = await saveSurveyDemographicAnswers(
      surveyId,
      userId,
      body.answers,
      { isTestData: isTestMode }
    );

    logger.info(
      '[POST /api/surveys/[id]/demographics/[pageId]/answers] Saved',
      savedAnswers.length,
      'answers for user:',
      userId,
      isTestMode ? '(test mode)' : ''
    );

    return NextResponse.json({
      success: true,
      answers: savedAnswers,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('[POST answers] Error:', errorMessage);
    if (errorStack) {
      logger.error('[POST answers] Stack:', errorStack);
    }
    return NextResponse.json(
      { error: 'Failed to save answers', details: errorMessage },
      { status: 500 }
    );
  }
}
