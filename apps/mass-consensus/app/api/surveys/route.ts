import { NextRequest, NextResponse } from 'next/server';
import { createSurvey, getSurveysByCreator } from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { CreateSurveyRequest } from '@/types/survey';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/surveys - List surveys for the authenticated user
 */
export async function GET(request: NextRequest) {
  // Rate limit check for admin endpoints
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.ADMIN);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
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

    const surveys = await getSurveysByCreator(userId);

    return NextResponse.json({
      surveys,
      total: surveys.length,
    });
  } catch (error) {
    logger.error('[GET /api/surveys] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch surveys' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/surveys - Create a new survey
 */
export async function POST(request: NextRequest) {
  // Rate limit check for admin write operations
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.ADMIN);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
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

    const body: CreateSurveyRequest = await request.json();

    // Validate required fields
    if (!body.title || body.title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    const survey = await createSurvey(userId, {
      title: body.title.trim(),
      description: body.description?.trim(),
      questionIds: body.questionIds || [],
      settings: body.settings,
      questionSettings: body.questionSettings,
    });

    logger.info('[POST /api/surveys] Created survey:', survey.surveyId, 'questionSettings:', JSON.stringify(body.questionSettings));

    return NextResponse.json(survey, { status: 201 });
  } catch (error) {
    logger.error('[POST /api/surveys] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create survey' },
      { status: 500 }
    );
  }
}
