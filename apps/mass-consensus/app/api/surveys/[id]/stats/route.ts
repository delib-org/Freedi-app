import { NextRequest, NextResponse } from 'next/server';
import { getSurveyStats, getSurveyWithQuestions } from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/surveys/[id]/stats
 * Get survey statistics (response count, completion count, completion rate)
 *
 * Query params:
 * - includeTestData: boolean - If true, includes test data in counts (default: false)
 * - includeFunnel: boolean - If true, includes per-question evaluation funnel (default: false)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const includeTestData = searchParams.get('includeTestData') === 'true';
    const includeFunnel = searchParams.get('includeFunnel') === 'true';

    // Extract and verify token
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Fetch survey with questions (needed for funnel and ownership check)
    const survey = await getSurveyWithQuestions(surveyId);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    if (survey.creatorId !== userId) {
      return NextResponse.json({ error: 'You can only view stats for your own surveys' }, { status: 403 });
    }

    // Build question list for funnel if requested
    const questionIds = includeFunnel
      ? survey.questions.map(q => ({ id: q.statementId, text: q.statement }))
      : undefined;

    const stats = await getSurveyStats(surveyId, { includeTestData }, questionIds);

    return NextResponse.json(stats);
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/stats] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch survey stats' },
      { status: 500 }
    );
  }
}
