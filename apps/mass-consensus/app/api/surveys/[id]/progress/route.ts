import { NextRequest, NextResponse } from 'next/server';
import { getSurveyProgress, upsertSurveyProgress, getSurveyById } from '@/lib/firebase/surveys';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { UpdateProgressRequest } from '@/types/survey';
import { logger } from '@/lib/utils/logger';

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/surveys/[id]/progress - Get user's progress for a survey
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

    const progress = await getSurveyProgress(surveyId, userId);

    if (!progress) {
      // Return empty progress if not started
      return NextResponse.json({
        hasProgress: false,
        surveyId,
        userId,
        currentQuestionIndex: 0,
        completedQuestionIds: [],
        startedAt: null,
        lastUpdated: null,
        isCompleted: false,
      });
    }

    return NextResponse.json({
      hasProgress: true,
      ...progress,
    });
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/progress] Error:', error);

    return NextResponse.json(
      { error: 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/surveys/[id]/progress - Update user's progress
 * If the survey is in test mode, the progress will be marked as test data
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const surveyId = context.params.id;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    const body: UpdateProgressRequest = await request.json();

    // Check if survey is in test mode
    const survey = await getSurveyById(surveyId);
    const isTestMode = survey?.isTestMode === true;

    const progress = await upsertSurveyProgress(surveyId, userId, {
      currentQuestionIndex: body.currentQuestionIndex,
      completedQuestionId: body.completedQuestionId,
      isCompleted: body.isCompleted,
      isTestData: isTestMode,
    });

    logger.info(
      '[POST /api/surveys/[id]/progress] Updated progress for user:',
      userId,
      isTestMode ? '(test mode)' : ''
    );

    return NextResponse.json(progress);
  } catch (error) {
    logger.error('[POST /api/surveys/[id]/progress] Error:', error);

    return NextResponse.json(
      { error: 'Failed to update progress' },
      { status: 500 }
    );
  }
}
