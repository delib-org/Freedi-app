import { NextRequest, NextResponse } from 'next/server';
import { getSurveyById, markSurveyEntered } from '@/lib/firebase/surveys';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';

interface RouteContext {
  params: { id: string };
}

/**
 * POST /api/surveys/[id]/enter
 * Record that a user entered the survey (landed on any survey page).
 *
 * Idempotently ensures a surveyProgress doc exists for the user — its
 * `startedAt` becomes the entry time. This lets admin results report a real
 * "entered" count and a real bounce count (entered but never evaluated or
 * submitted), which previously was invisible because progress docs were
 * only written when users clicked through the flow.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.STANDARD);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const surveyId = context.params.id;

    const body = await request.json().catch(() => ({}));
    const bodyUserId = typeof body.userId === 'string' ? body.userId : undefined;
    const userId = bodyUserId || getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    await markSurveyEntered(surveyId, userId, survey.isTestMode === true);

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('[POST /api/surveys/[id]/enter] Error:', error);

    return NextResponse.json({ error: 'Failed to record entry' }, { status: 500 });
  }
}
