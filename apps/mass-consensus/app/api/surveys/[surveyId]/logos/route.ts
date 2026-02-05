import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';
import { getSurveyById, addLogoToSurvey } from '@/lib/firebase/surveys';
import { uploadSurveyLogo } from '@/lib/firebase/storage';
import type { UploadLogoRequest } from '@/types/survey';

/**
 * GET /api/surveys/[surveyId]/logos
 * Get all logos for a survey
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
      logos: survey.logos || [],
    });
  } catch (error) {
    logger.error('[GET /api/surveys/[surveyId]/logos] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch logos' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/surveys/[surveyId]/logos
 * Upload a new logo for a survey
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
        { error: 'Only survey creator can upload logos' },
        { status: 403 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const altText = formData.get('altText') as string || '';
    const orderStr = formData.get('order') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      );
    }

    // Determine order (if not provided, put at end)
    const currentLogos = survey.logos || [];
    const order = orderStr ? parseInt(orderStr, 10) : currentLogos.length;

    // Upload to Firebase Storage
    const logo = await uploadSurveyLogo(surveyId, file, altText, order);

    // Add to survey document
    const updatedSurvey = await addLogoToSurvey(surveyId, logo);

    if (!updatedSurvey) {
      return NextResponse.json(
        { error: 'Failed to update survey' },
        { status: 500 }
      );
    }

    logger.info('[POST /api/surveys/[surveyId]/logos] Logo uploaded:', logo.logoId);

    return NextResponse.json({
      logo,
      message: 'Logo uploaded successfully',
    }, { status: 201 });

  } catch (error) {
    logger.error('[POST /api/surveys/[surveyId]/logos] Error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Invalid file type') || error.message.includes('File too large')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to upload logo' },
      { status: 500 }
    );
  }
}
