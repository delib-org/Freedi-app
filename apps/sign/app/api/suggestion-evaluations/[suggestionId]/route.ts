import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import { Collections, calcBinaryConsensus } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

interface EvaluationInput {
  evaluation: number; // -1 or 1
}

/**
 * Lazy migration: ensures the Statement has a standard `evaluation` object.
 * If the Statement only has the old `positiveEvaluations`/`negativeEvaluations` fields,
 * this counts all existing evaluations and initializes the `evaluation` object
 * so the Firebase function can atomically increment from correct base values.
 */
async function ensureEvaluationObjectExists(
  db: FirebaseFirestore.Firestore,
  suggestionId: string
): Promise<void> {
  const statementRef = db.collection(Collections.statements).doc(suggestionId);
  const statementSnap = await statementRef.get();

  if (!statementSnap.exists) return;

  const statementData = statementSnap.data() as Record<string, unknown>;

  // If the evaluation object already exists, no migration needed
  if (statementData.evaluation && typeof statementData.evaluation === 'object') {
    return;
  }

  // Count all existing evaluations for this suggestion
  const evaluationsSnap = await db
    .collection(Collections.evaluations)
    .where('statementId', '==', suggestionId)
    .get();

  let positiveCount = 0;
  let negativeCount = 0;

  evaluationsSnap.docs.forEach((evalDoc) => {
    const evalData = evalDoc.data();
    const evalValue = evalData.evaluation || 0;
    if (evalValue > 0) positiveCount++;
    else if (evalValue < 0) negativeCount++;
  });

  const numberOfEvaluators = positiveCount + negativeCount;
  const sumEvaluations = positiveCount - negativeCount;
  const sumSquaredEvaluations = positiveCount + negativeCount; // since 1² = (-1)² = 1
  const consensus = calcBinaryConsensus(positiveCount, negativeCount);

  await statementRef.update({
    evaluation: {
      sumEvaluations,
      numberOfEvaluators,
      agreement: consensus,
      sumPro: positiveCount,
      sumCon: negativeCount,
      numberOfProEvaluators: positiveCount,
      numberOfConEvaluators: negativeCount,
      sumSquaredEvaluations,
      averageEvaluation: numberOfEvaluators > 0 ? sumEvaluations / numberOfEvaluators : 0,
      evaluationRandomNumber: Math.random(),
      viewed: 0,
    },
    consensus,
    totalEvaluators: numberOfEvaluators,
  });

  logger.info(`[Suggestion Evaluations API] Lazy migration: initialized evaluation object for ${suggestionId} (pro=${positiveCount}, con=${negativeCount})`);
}

/**
 * GET /api/suggestion-evaluations/[suggestionId]
 * Get evaluations for a suggestion and the current user's evaluation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ suggestionId: string }> }
) {
  try {
    const { suggestionId } = await params;
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    const db = getFirestoreAdmin();

    // Read counts from the Statement's evaluation object (populated by Firebase function)
    const statementSnap = await db.collection(Collections.statements).doc(suggestionId).get();
    const statementData = statementSnap.data() as Statement | undefined;

    const evaluation = statementData?.evaluation;
    const positiveEvaluations = evaluation?.numberOfProEvaluators || 0;
    const negativeEvaluations = evaluation?.numberOfConEvaluators || 0;
    const sumEvaluation = evaluation?.sumEvaluations || 0;
    const evaluationCount = (evaluation?.numberOfEvaluators || 0);

    // Check if the current user has an evaluation
    let userEvaluation: number | null = null;
    if (userId) {
      const evalId = `${userId}--${suggestionId}`;
      const evalDoc = await db.collection(Collections.evaluations).doc(evalId).get();
      if (evalDoc.exists) {
        const evalData = evalDoc.data();
        userEvaluation = evalData?.evaluation ?? null;
      }
    }

    return NextResponse.json({
      sumEvaluation,
      userEvaluation,
      evaluationCount,
      positiveEvaluations,
      negativeEvaluations,
    });
  } catch (error) {
    logger.error('[Suggestion Evaluations API] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/suggestion-evaluations/[suggestionId]
 * Create or update an evaluation for a suggestion.
 * The Firebase function (fn_evaluation.ts) handles updating the Statement's
 * evaluation object and consensus atomically.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ suggestionId: string }> }
) {
  try {
    const { suggestionId } = await params;
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const body: EvaluationInput = await request.json();
    const { evaluation } = body;

    // Validate evaluation value (-1 or 1)
    if (evaluation !== -1 && evaluation !== 1) {
      return NextResponse.json(
        { error: 'Evaluation must be -1 or 1' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // Get the suggestion (stored as Statement) to verify it exists and get parentId
    const suggestionRef = await db.collection(Collections.statements).doc(suggestionId).get();

    if (!suggestionRef.exists) {
      return NextResponse.json(
        { error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    const suggestion = suggestionRef.data() as Statement | undefined;

    // Users cannot evaluate their own suggestions
    if (suggestion?.creatorId === userId) {
      return NextResponse.json(
        { error: 'Cannot evaluate your own suggestion' },
        { status: 403 }
      );
    }

    // Ensure the Statement has a standard evaluation object before writing
    // so the Firebase function can atomically increment from correct base values
    await ensureEvaluationObjectExists(db, suggestionId);

    // Get display name
    const displayName = getUserDisplayNameFromCookie(cookieHeader) || getAnonymousDisplayName(userId);

    // Evaluation ID follows pattern: ${userId}--${suggestionId}
    const evaluationId = `${userId}--${suggestionId}`;

    const evaluationData = {
      evaluationId,
      statementId: suggestionId,
      suggestionId,
      parentId: suggestion?.parentId || suggestionId,
      documentId: suggestion?.topParentId || '',
      evaluatorId: userId,
      evaluation,
      updatedAt: Date.now(),
      evaluator: {
        displayName,
        uid: userId,
      },
    };

    await db.collection(Collections.evaluations).doc(evaluationId).set(evaluationData);

    logger.info(`[Suggestion Evaluations API] Created/updated evaluation: ${evaluationId}`);

    return NextResponse.json({
      success: true,
      evaluation: evaluationData,
    });
  } catch (error) {
    logger.error('[Suggestion Evaluations API] POST error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/suggestion-evaluations/[suggestionId]
 * Remove user's evaluation from a suggestion.
 * The Firebase function (fn_evaluation.ts) handles updating the Statement's
 * evaluation object and consensus atomically.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ suggestionId: string }> }
) {
  try {
    const { suggestionId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const db = getFirestoreAdmin();

    const evaluationId = `${userId}--${suggestionId}`;

    // Get existing evaluation
    const evalRef = await db.collection(Collections.evaluations).doc(evaluationId).get();

    if (!evalRef.exists) {
      return NextResponse.json(
        { error: 'Evaluation not found' },
        { status: 404 }
      );
    }

    // Delete the evaluation — Firebase function handles Statement update
    await db.collection(Collections.evaluations).doc(evaluationId).delete();

    logger.info(`[Suggestion Evaluations API] Deleted evaluation: ${evaluationId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Suggestion Evaluations API] DELETE error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
