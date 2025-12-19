import { NextRequest, NextResponse } from 'next/server';
import {
  getSurveyById,
  getSurveyWithQuestions,
  updateSurvey,
  deleteSurvey,
} from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { UpdateSurveyRequest } from '@/types/survey';
import { logger } from '@/lib/utils/logger';

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/surveys/[id] - Get survey by ID
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const surveyId = context.params.id;
    const includeQuestions = request.nextUrl.searchParams.get('include') === 'questions';

    const survey = includeQuestions
      ? await getSurveyWithQuestions(surveyId)
      : await getSurveyById(surveyId);

    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(survey);
  } catch (error) {
    logger.error('[GET /api/surveys/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch survey' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/surveys/[id] - Update survey
 */
export async function PUT(request: NextRequest, context: RouteContext) {
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

    const surveyId = context.params.id;
    const existingSurvey = await getSurveyById(surveyId);

    if (!existingSurvey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (existingSurvey.creatorId !== userId) {
      return NextResponse.json(
        { error: 'You can only update your own surveys' },
        { status: 403 }
      );
    }

    const body: UpdateSurveyRequest = await request.json();

    const updatedSurvey = await updateSurvey(surveyId, body);

    if (!updatedSurvey) {
      return NextResponse.json(
        { error: 'Failed to update survey' },
        { status: 500 }
      );
    }

    logger.info('[PUT /api/surveys/[id]] Updated survey:', surveyId, 'questionSettings:', JSON.stringify(body.questionSettings));

    return NextResponse.json(updatedSurvey);
  } catch (error) {
    logger.error('[PUT /api/surveys/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update survey' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/surveys/[id] - Delete survey
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
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

    const surveyId = context.params.id;
    const existingSurvey = await getSurveyById(surveyId);

    if (!existingSurvey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (existingSurvey.creatorId !== userId) {
      return NextResponse.json(
        { error: 'You can only delete your own surveys' },
        { status: 403 }
      );
    }

    const deleted = await deleteSurvey(surveyId);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete survey' },
        { status: 500 }
      );
    }

    logger.info('[DELETE /api/surveys/[id]] Deleted survey:', surveyId);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[DELETE /api/surveys/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete survey' },
      { status: 500 }
    );
  }
}
