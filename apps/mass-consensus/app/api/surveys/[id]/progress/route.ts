import { NextRequest, NextResponse } from 'next/server';
import { getSurveyProgress, upsertSurveyProgress, getSurveyById } from '@/lib/firebase/surveys';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { UpdateProgressRequest } from '@/types/survey';
import { logger } from '@/lib/utils/logger';
import { logResearchAction } from '@/lib/utils/researchLogger';
import { Collections, ResearchAction } from '@freedi/shared-types';

interface RouteContext {
  params: { id: string };
}

async function logSurveyEntry(surveyId: string, userId: string): Promise<void> {
  const survey = await getSurveyById(surveyId);
  const parentStatementId = survey?.parentStatementId;
  if (!parentStatementId) return;

  const db = getFirestoreAdmin();
  const parentDoc = await db.collection(Collections.statements).doc(parentStatementId).get();
  const researchEnabled = parentDoc.data()?.statementSettings?.enableResearchLogging === true;

  logResearchAction(userId, ResearchAction.LOGIN, researchEnabled, {
    topParentId: parentStatementId,
    metadata: { isAnonymous: userId.startsWith('anon_') },
  });
}

/**
 * GET /api/surveys/[id]/progress - Get user's progress for a survey
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const surveyId = context.params.id;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    const progress = await getSurveyProgress(surveyId, userId);

    if (!progress) {
      // First visit to this survey for this user — emit a LOGIN research event
      // so anonymous MC users show up in the admin research dashboard alongside
      // authenticated logins from the main app. Gated by the parent statement's
      // research-logging setting to respect per-project opt-in.
      logSurveyEntry(surveyId, userId).catch((error) => {
        logger.error('[GET /api/surveys/[id]/progress] Failed to log entry:', error);
      });

      // Return empty progress if not started
      return NextResponse.json({
        hasProgress: false,
        surveyId,
        userId,
        currentQuestionIndex: 0,
        completedQuestionIds: [],
        startedAt: null,
        lastUpdated: null,
        isCompleted: false,
      });
    }

    return NextResponse.json({
      hasProgress: true,
      ...progress,
    });
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/progress] Error:', error);

    return NextResponse.json(
      { error: 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/surveys/[id]/progress - Update user's progress
 * If the survey is in test mode, the progress will be marked as test data
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const surveyId = context.params.id;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    const body: UpdateProgressRequest = await request.json();

    // Check if survey is in test mode
    const survey = await getSurveyById(surveyId);
    const isTestMode = survey?.isTestMode === true;

    const progress = await upsertSurveyProgress(surveyId, userId, {
      currentQuestionIndex: body.currentQuestionIndex,
      completedQuestionId: body.completedQuestionId,
      isCompleted: body.isCompleted,
      isTestData: isTestMode,
    });

    logger.info(
      '[POST /api/surveys/[id]/progress] Updated progress for user:',
      userId,
      isTestMode ? '(test mode)' : ''
    );

    return NextResponse.json(progress);
  } catch (error) {
    logger.error('[POST /api/surveys/[id]/progress] Error:', error);

    return NextResponse.json(
      { error: 'Failed to update progress' },
      { status: 500 }
    );
  }
}
