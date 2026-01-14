import { NextRequest, NextResponse } from 'next/server';
import {
  getSurveyById,
  markAllDataAsTestData,
  unmarkRetroactiveTestData,
  getRetroactiveTestDataCounts,
} from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/surveys/[id]/test-data/mark-all
 * Get counts of data that was retroactively marked as pilot data
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
      return NextResponse.json(
        { error: 'You can only view pilot data for your own surveys' },
        { status: 403 }
      );
    }

    const counts = await getRetroactiveTestDataCounts(surveyId, survey.questionIds || []);

    return NextResponse.json(counts);
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/test-data/mark-all] Error:', error);

    return NextResponse.json(
      { error: 'Failed to fetch pilot data counts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/surveys/[id]/test-data/mark-all
 * Mark all existing live data as pilot/test data
 */
export async function POST(
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
      return NextResponse.json(
        { error: 'You can only mark pilot data for your own surveys' },
        { status: 403 }
      );
    }

    const result = await markAllDataAsTestData(surveyId, survey.questionIds || []);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to mark data as pilot' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error('[POST /api/surveys/[id]/test-data/mark-all] Error:', error);

    return NextResponse.json(
      { error: 'Failed to mark data as pilot' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/surveys/[id]/test-data/mark-all
 * Unmark data that was retroactively marked as pilot (restore to live data)
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
      return NextResponse.json(
        { error: 'You can only unmark pilot data for your own surveys' },
        { status: 403 }
      );
    }

    const result = await unmarkRetroactiveTestData(surveyId, survey.questionIds || []);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to unmark pilot data' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error('[DELETE /api/surveys/[id]/test-data/mark-all] Error:', error);

    return NextResponse.json(
      { error: 'Failed to unmark pilot data' },
      { status: 500 }
    );
  }
}
