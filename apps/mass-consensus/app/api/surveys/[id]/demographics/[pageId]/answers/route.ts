import { NextRequest, NextResponse } from 'next/server';
import {
  saveSurveyDemographicAnswers,
  getSurveyDemographicAnswers,
  getSurveyById,
} from '@/lib/firebase/surveys';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { logger } from '@/lib/utils/logger';

interface RouteContext {
  params: { id: string; pageId: string };
}

interface SaveAnswersRequest {
  answers: Array<{
    questionId: string;
    answer?: string;
    answerOptions?: string[];
  }>;
}

/**
 * GET /api/surveys/[id]/demographics/[pageId]/answers - Get user's demographic answers
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const surveyId = context.params.id;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
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
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    logger.info(`[POST answers] surveyId: ${surveyId}, pageId: ${pageId}`);
    logger.info(`[POST answers] Cookie header: ${cookieHeader?.substring(0, 100)}...`);
    logger.info(`[POST answers] Extracted userId: ${userId}`);

    if (!userId) {
      logger.warn('[POST answers] No userId found in cookies');
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
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

    const savedAnswers = await saveSurveyDemographicAnswers(surveyId, userId, body.answers);

    logger.info(
      '[POST /api/surveys/[id]/demographics/[pageId]/answers] Saved',
      savedAnswers.length,
      'answers for user:',
      userId
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
