import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';
import { getSurveyById, reorderSurveyLogos } from '@/lib/firebase/surveys';
import type { ReorderLogosRequest } from '@/types/survey';

/**
 * POST /api/surveys/[surveyId]/logos/reorder
 * Reorder logos in a survey
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  // Rate limit check
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.STANDARD);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { surveyId } = params;

    // Check authentication
    const userId = getUserIdFromCookie(request.headers.get('cookie'));
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify survey exists and user is creator
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }

    if (survey.creatorId !== userId) {
      return NextResponse.json(
        { error: 'Only survey creator can reorder logos' },
        { status: 403 }
      );
    }

    // Parse request body
    const { logoIds }: ReorderLogosRequest = await request.json();

    if (!Array.isArray(logoIds)) {
      return NextResponse.json(
        { error: 'logoIds must be an array' },
        { status: 400 }
      );
    }

    // Reorder logos
    const updatedSurvey = await reorderSurveyLogos(surveyId, logoIds);

    if (!updatedSurvey) {
      return NextResponse.json(
        { error: 'Failed to reorder logos' },
        { status: 500 }
      );
    }

    logger.info('[POST /api/surveys/[surveyId]/logos/reorder] Logos reordered for survey:', surveyId);

    return NextResponse.json({
      logos: updatedSurvey.logos || [],
      message: 'Logos reordered successfully',
    });

  } catch (error) {
    logger.error('[POST /api/surveys/[surveyId]/logos/reorder] Error:', error);
    return NextResponse.json(
      { error: 'Failed to reorder logos' },
      { status: 500 }
    );
  }
}
