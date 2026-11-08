import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedUserId, unauthorizedResponse, verifyParticipant } from '@/lib/auth/requestIdentity';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections } from '@freedi/shared-types';
import { upsertEvaluation } from '@/lib/firebase/evaluations/evaluationWrites';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';
import { logResearchAction } from '@/lib/utils/researchLogger';
import { ResearchAction } from '@freedi/shared-types';
import { getSurveyById, getStatementIdForSurvey } from '@/lib/firebase/surveys';

/**
 * POST /api/evaluations/[id]
 * Submit or update an evaluation for a solution
 * Follows the same pattern as setEvaluationToDB from main app
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit check - standard for evaluations
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.STANDARD);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // Identity comes only from the verified ID token: never from the body, query
    // or a cookie. verifyIdToken without checkRevoked is a local signature check
    // against cached Google certs, so voting gains no network round trip.
    const participant = await verifyParticipant(request);
    if (!participant) {
      return unauthorizedResponse();
    }

    const { userId, displayName } = participant;
    const { id: statementId } = await params;
    const body = await request.json();
    const { evaluation, surveyId } = body;

    // Validate evaluation range (-1 to 1)
    if (typeof evaluation !== 'number' || evaluation < -1 || evaluation > 1) {
      return NextResponse.json(
        { error: 'Evaluation must be a number between -1 and 1' },
        { status: 400 }
      );
    }
    const db = getFirestoreAdmin();

    // Get statement to find parentId
    const statementDoc = await db
      .collection(Collections.statements)
      .doc(statementId)
      .get();

    if (!statementDoc.exists) {
      return NextResponse.json(
        { error: 'Statement not found' },
        { status: 404 }
      );
    }

    const statement = statementDoc.data();
    const parentId = statement?.parentId;

    if (!parentId) {
      return NextResponse.json(
        { error: 'Statement has no parent' },
        { status: 400 }
      );
    }

    // If this evaluation was submitted inside a survey session, resolve the
    // survey's demographic anchor and stamp it on the evaluation. The
    // polarization index uses this to look up the evaluator's demographic
    // answers directly instead of walking the parent chain.
    let demographicAnchorId: string | undefined;
    if (typeof surveyId === 'string' && surveyId) {
      const survey = await getSurveyById(surveyId);
      if (survey) {
        demographicAnchorId = getStatementIdForSurvey(survey);
      } else {
        logger.info('[API] Evaluation submitted with unknown surveyId', { surveyId });
      }
    }

    // Save evaluation and update userEvaluations in a single transaction
    // (deterministic id, anchor preserved on re-evaluation)
    const { evaluationId } = await upsertEvaluation(db, {
      statementId,
      parentId,
      userId,
      displayName,
      evaluation,
      demographicAnchorId,
    });

    // Research logging — check parent question's settings
    const topParentId = statement?.topParentId || parentId;
    const parentDoc = await db.collection(Collections.statements).doc(parentId).get();
    const researchEnabled = parentDoc.data()?.statementSettings?.enableResearchLogging === true;
    logResearchAction(userId, ResearchAction.EVALUATE, researchEnabled, {
      statementId,
      parentId,
      topParentId,
      newValue: String(evaluation),
    });

    // Consensus is deliberately NOT written here. The onCreateEvaluation /
    // onUpdateEvaluation trigger recomputes it from the maintained aggregates
    // as soon as the evaluation doc lands; the fire-and-forget call that used
    // to sit here overwrote that with a plain average and raced it.

    return NextResponse.json({
      success: true,
      evaluationId,
    });
  } catch (error) {
    logger.error('[API] Evaluation error:', error);
    
return NextResponse.json(
      {
        error: 'Failed to save evaluation',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/evaluations/[id]
 * Get user's evaluation for a statement
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit check - more lenient for reads
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.READ);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { id: statementId } = await params;
    const userId = await getVerifiedUserId(request);

    if (!userId) {
      return NextResponse.json({ evaluation: null });
    }
    const evaluationId = `${userId}--${statementId}`;

    const db = getFirestoreAdmin();
    const evaluationDoc = await db
      .collection(Collections.evaluations)
      .doc(evaluationId)
      .get();

    if (!evaluationDoc.exists) {
      return NextResponse.json({ evaluation: null });
    }

    return NextResponse.json({
      evaluation: evaluationDoc.data(),
    });
  } catch (error) {
    logger.error('[API] Get evaluation error:', error);
    
return NextResponse.json(
      { error: 'Failed to get evaluation' },
      { status: 500 }
    );
  }
}
