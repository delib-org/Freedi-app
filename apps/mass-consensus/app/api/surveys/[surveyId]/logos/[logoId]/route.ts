import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';
import { getSurveyById, removeLogoFromSurvey, updateLogoInSurvey } from '@/lib/firebase/surveys';
import { deleteSurveyLogo } from '@/lib/firebase/storage';
import type { UpdateLogoRequest } from '@/types/survey';

/**
 * DELETE /api/surveys/[surveyId]/logos/[logoId]
 * Delete a logo from a survey
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { surveyId: string; logoId: string } }
) {
  // Rate limit check
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.STANDARD);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { surveyId, logoId } = params;

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
        { error: 'Only survey creator can delete logos' },
        { status: 403 }
      );
    }

    // Find logo to get storage URL
    const logo = survey.logos?.find((l) => l.logoId === logoId);
    if (!logo) {
      return NextResponse.json(
        { error: 'Logo not found' },
        { status: 404 }
      );
    }

    // Delete from Firebase Storage
    await deleteSurveyLogo(logo.storageUrl);

    // Remove from survey document
    const updatedSurvey = await removeLogoFromSurvey(surveyId, logoId);

    if (!updatedSurvey) {
      return NextResponse.json(
        { error: 'Failed to update survey' },
        { status: 500 }
      );
    }

    logger.info('[DELETE /api/surveys/[surveyId]/logos/[logoId]] Logo deleted:', logoId);

    return NextResponse.json({
      message: 'Logo deleted successfully',
    });

  } catch (error) {
    logger.error('[DELETE /api/surveys/[surveyId]/logos/[logoId]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete logo' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/surveys/[surveyId]/logos/[logoId]
 * Update logo metadata (alt text, order, dimensions)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { surveyId: string; logoId: string } }
) {
  // Rate limit check
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.STANDARD);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { surveyId, logoId } = params;

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
        { error: 'Only survey creator can update logos' },
        { status: 403 }
      );
    }

    // Parse request body
    const updates: UpdateLogoRequest = await request.json();

    // Update logo in survey
    const updatedSurvey = await updateLogoInSurvey(surveyId, logoId, updates);

    if (!updatedSurvey) {
      return NextResponse.json(
        { error: 'Failed to update logo' },
        { status: 500 }
      );
    }

    // Find updated logo
    const updatedLogo = updatedSurvey.logos?.find((l) => l.logoId === logoId);

    logger.info('[PATCH /api/surveys/[surveyId]/logos/[logoId]] Logo updated:', logoId);

    return NextResponse.json({
      logo: updatedLogo,
      message: 'Logo updated successfully',
    });

  } catch (error) {
    logger.error('[PATCH /api/surveys/[surveyId]/logos/[logoId]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update logo' },
      { status: 500 }
    );
  }
}
