import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';
import { getSurveyById, updateSurveyOpeningSlide } from '@/lib/firebase/surveys';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Role } from '@freedi/shared-types';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';

/**
 * GET /api/surveys/[id]/opening-slide
 * Get opening slide configuration for a survey
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const surveyId = params.id;

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
    logger.error('[GET /api/surveys/[id]/opening-slide] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch opening slide' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/surveys/[id]/opening-slide
 * Update opening slide configuration
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Rate limit check
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.STANDARD);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const surveyId = params.id;

    // Check authentication via Bearer token
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
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

    // Check if user is creator or has admin role
    const isCreator = survey.creatorId === userId;
    let isAdmin = false;

    if (!isCreator) {
      // Check if user has admin subscription to this survey
      const db = getFirestoreAdmin();
      const adminSubscription = await db
        .collection(Collections.statementsSubscribe)
        .where('statementId', '==', surveyId)
        .where('userId', '==', userId)
        .where('role', '==', Role.admin)
        .limit(1)
        .get();

      isAdmin = !adminSubscription.empty;
    }

    if (!isCreator && !isAdmin) {
      return NextResponse.json(
        { error: 'Only survey creator or admin can update opening slide' },
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

    logger.info('[PATCH /api/surveys/[id]/opening-slide] Opening slide updated:', surveyId);

    return NextResponse.json({
      showOpeningSlide: updatedSurvey.showOpeningSlide,
      openingSlideContent: updatedSurvey.openingSlideContent,
      message: 'Opening slide updated successfully',
    });

  } catch (error) {
    logger.error('[PATCH /api/surveys/[id]/opening-slide] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update opening slide' },
      { status: 500 }
    );
  }
}

