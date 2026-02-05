import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { getSurveyProgress } from '@/lib/firebase/surveys';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/surveys/[surveyId]/progress
 * Get user's progress for a survey
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  try {
    const { surveyId } = params;

    // Get user ID (can be authenticated or anonymous)
    const userId = getUserIdFromCookie(request.headers.get('cookie'));
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const progress = await getSurveyProgress(surveyId, userId);

    if (!progress) {
      return NextResponse.json(
        { error: 'Progress not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(progress);
  } catch (error) {
    logger.error('[GET /api/surveys/[surveyId]/progress] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}
