import { NextRequest, NextResponse } from 'next/server';
import { getSurveyById, getTestDataCounts, clearSurveyTestData } from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/surveys/[id]/test-data
 * Get test data counts for a survey
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;

    // Extract and verify token
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Verify user owns this survey
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    if (survey.creatorId !== userId) {
      return NextResponse.json({ error: 'You can only manage test data for your own surveys' }, { status: 403 });
    }

    const counts = await getTestDataCounts(surveyId);

    return NextResponse.json(counts);
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/test-data] Error:', error);

    return NextResponse.json(
      { error: 'Failed to fetch test data counts' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/surveys/[id]/test-data
 * Clear all test data for a survey
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;

    // Extract and verify token
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Verify user owns this survey
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    if (survey.creatorId !== userId) {
      return NextResponse.json({ error: 'You can only clear test data for your own surveys' }, { status: 403 });
    }

    const result = await clearSurveyTestData(surveyId);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to clear test data' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error('[DELETE /api/surveys/[id]/test-data] Error:', error);

    return NextResponse.json(
      { error: 'Failed to clear test data' },
      { status: 500 }
    );
  }
}
