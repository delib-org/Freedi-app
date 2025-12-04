import { NextRequest, NextResponse } from 'next/server';
import { createSurvey, getSurveysByCreator } from '@/lib/firebase/surveys';
import { verifyAdmin, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { CreateSurveyRequest } from '@/types/survey';

/**
 * GET /api/surveys - List surveys for the authenticated admin
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));

    if (!token) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const { isAdmin, userId, error } = await verifyAdmin(token);

    if (!isAdmin) {
      return NextResponse.json(
        { error: error || 'Admin access required' },
        { status: 403 }
      );
    }

    const surveys = await getSurveysByCreator(userId);

    return NextResponse.json({
      surveys,
      total: surveys.length,
    });
  } catch (error) {
    console.error('[GET /api/surveys] Error:', error);
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
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));

    if (!token) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const { isAdmin, userId, error } = await verifyAdmin(token);

    if (!isAdmin) {
      return NextResponse.json(
        { error: error || 'Admin access required' },
        { status: 403 }
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
    });

    console.info('[POST /api/surveys] Created survey:', survey.surveyId);

    return NextResponse.json(survey, { status: 201 });
  } catch (error) {
    console.error('[POST /api/surveys] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create survey' },
      { status: 500 }
    );
  }
}
