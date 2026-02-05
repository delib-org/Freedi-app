import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';
import { getSurveyById, updateSurveyOpeningSlide } from '@/lib/firebase/surveys';

/**
 * GET /api/surveys/[surveyId]/opening-slide
 * Get opening slide configuration for a survey
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  try {
    const { surveyId } = params;

    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      showOpeningSlide: survey.showOpeningSlide || false,
      openingSlideContent: survey.openingSlideContent || '',
      logos: survey.logos || [],
    });
  } catch (error) {
    logger.error('[GET /api/surveys/[surveyId]/opening-slide] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch opening slide' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/surveys/[surveyId]/opening-slide
 * Update opening slide configuration
 */
export async function PATCH(
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
        { error: 'Only survey creator can update opening slide' },
        { status: 403 }
      );
    }

    // Parse request body
    const { content, show } = await request.json();

    if (typeof show !== 'boolean') {
      return NextResponse.json(
        { error: 'show must be a boolean' },
        { status: 400 }
      );
    }

    // Update opening slide
    const updatedSurvey = await updateSurveyOpeningSlide(
      surveyId,
      content || '',
      show
    );

    if (!updatedSurvey) {
      return NextResponse.json(
        { error: 'Failed to update opening slide' },
        { status: 500 }
      );
    }

    logger.info('[PATCH /api/surveys/[surveyId]/opening-slide] Opening slide updated:', surveyId);

    return NextResponse.json({
      showOpeningSlide: updatedSurvey.showOpeningSlide,
      openingSlideContent: updatedSurvey.openingSlideContent,
      message: 'Opening slide updated successfully',
    });

  } catch (error) {
    logger.error('[PATCH /api/surveys/[surveyId]/opening-slide] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update opening slide' },
      { status: 500 }
    );
  }
}

