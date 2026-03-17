import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import { Collections, calcBinaryConsensus } from '@freedi/shared-types';
import type { Statement, StatementEvaluation } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

interface EvaluationInput {
  evaluation: number; // -1 or 1
}

/**
 * Computes the diff between old and new evaluations for atomic increment updates.
 */
function computeEvalDiffs(oldEval: number, newEval: number) {
  const proDiff = (newEval > 0 ? 1 : 0) - (oldEval > 0 ? 1 : 0);
  const conDiff = (newEval < 0 ? 1 : 0) - (oldEval < 0 ? 1 : 0);
  const evalDiff = newEval - oldEval;
  const squaredDiff = newEval * newEval - oldEval * oldEval;
  const evaluatorDiff = (newEval !== 0 ? 1 : 0) - (oldEval !== 0 ? 1 : 0);

  return { proDiff, conDiff, evalDiff, squaredDiff, evaluatorDiff };
}

/**
 * Atomically increments the Statement's evaluation counters using FieldValue.increment,
 * then recalculates consensus in a Firestore transaction from the updated values.
 * This is race-condition-safe: increments are atomic, and consensus is calculated
 * inside a transaction from the authoritative counter values.
 */
async function atomicUpdateStatement(
  db: FirebaseFirestore.Firestore,
  suggestionId: string,
  diffs: ReturnType<typeof computeEvalDiffs>,
  ensureEvaluationObject: boolean,
): Promise<void> {
  const statementRef = db.collection(Collections.statements).doc(suggestionId);

  // If the statement doesn't have an evaluation object yet, initialize it
  // before using FieldValue.increment (which requires the fields to exist)
  if (ensureEvaluationObject) {
    const snap = await statementRef.get();
    const data = snap.data() as Record<string, unknown> | undefined;
    if (!data?.evaluation || typeof data.evaluation !== 'object') {
      await statementRef.update({
        evaluation: {
          sumEvaluations: 0,
          numberOfEvaluators: 0,
          agreement: 0,
          sumPro: 0,
          sumCon: 0,
          numberOfProEvaluators: 0,
          numberOfConEvaluators: 0,
          sumSquaredEvaluations: 0,
          averageEvaluation: 0,
          evaluationRandomNumber: Math.random(),
          viewed: 0,
        },
      });
    }
  }

  // Step 1: Atomic increments for all counting fields
  await statementRef.update({
    'evaluation.numberOfProEvaluators': FieldValue.increment(diffs.proDiff),
    'evaluation.numberOfConEvaluators': FieldValue.increment(diffs.conDiff),
    'evaluation.sumEvaluations': FieldValue.increment(diffs.evalDiff),
    'evaluation.numberOfEvaluators': FieldValue.increment(diffs.evaluatorDiff),
    'evaluation.sumSquaredEvaluations': FieldValue.increment(diffs.squaredDiff),
    'evaluation.sumPro': FieldValue.increment(Math.max(diffs.proDiff, 0)),
    'evaluation.sumCon': FieldValue.increment(Math.max(diffs.conDiff, 0)),
    totalEvaluators: FieldValue.increment(diffs.evaluatorDiff),
    lastUpdate: Date.now(),
  });

  // Step 2: Transaction to read updated counters and write consensus
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(statementRef);
    const evaluation = doc.data()?.evaluation as StatementEvaluation | undefined;

    const pro = Math.max(0, evaluation?.numberOfProEvaluators || 0);
    const con = Math.max(0, evaluation?.numberOfConEvaluators || 0);
    const numEvals = evaluation?.numberOfEvaluators || 0;
    const sumEvals = evaluation?.sumEvaluations || 0;
    const consensus = calcBinaryConsensus(pro, con);

    transaction.update(statementRef, {
      consensus,
      'evaluation.agreement': consensus,
      'evaluation.averageEvaluation': numEvals > 0 ? sumEvals / numEvals : 0,
    });
  });
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

    const statementSnap = await db.collection(Collections.statements).doc(suggestionId).get();
    const statementData = statementSnap.data() as Statement | undefined;

    const evaluation = statementData?.evaluation;
    const positiveEvaluations = evaluation?.numberOfProEvaluators || 0;
    const negativeEvaluations = evaluation?.numberOfConEvaluators || 0;
    const sumEvaluation = evaluation?.sumEvaluations || 0;
    const evaluationCount = evaluation?.numberOfEvaluators || 0;

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
 * Uses atomic FieldValue.increment for counters and a transaction for consensus.
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

    if (evaluation !== -1 && evaluation !== 1) {
      return NextResponse.json(
        { error: 'Evaluation must be -1 or 1' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // Verify suggestion exists
    const suggestionSnap = await db.collection(Collections.statements).doc(suggestionId).get();
    if (!suggestionSnap.exists) {
      return NextResponse.json(
        { error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    const suggestion = suggestionSnap.data() as Statement | undefined;

    if (suggestion?.creatorId === userId) {
      return NextResponse.json(
        { error: 'Cannot evaluate your own suggestion' },
        { status: 403 }
      );
    }

    // Read old evaluation to compute diff
    const evaluationId = `${userId}--${suggestionId}`;
    const oldEvalSnap = await db.collection(Collections.evaluations).doc(evaluationId).get();
    const oldEval = oldEvalSnap.exists ? (oldEvalSnap.data()?.evaluation || 0) : 0;
    const isNew = !oldEvalSnap.exists;

    const displayName = getUserDisplayNameFromCookie(cookieHeader) || getAnonymousDisplayName(userId);

    const evaluationData = {
      evaluationId,
      statementId: suggestionId,
      suggestionId,
      parentId: suggestion?.parentId || suggestionId,
      documentId: suggestion?.topParentId || '',
      evaluatorId: userId,
      evaluation,
      updatedAt: Date.now(),
      source: 'sign' as const,
      evaluator: {
        displayName,
        uid: userId,
      },
    };

    // Write evaluation doc
    await db.collection(Collections.evaluations).doc(evaluationId).set(evaluationData);

    // Compute diffs and atomically update statement
    const diffs = computeEvalDiffs(oldEval, evaluation);
    await atomicUpdateStatement(db, suggestionId, diffs, isNew);

    logger.info(`[Suggestion Evaluations API] ${isNew ? 'Created' : 'Updated'} evaluation: ${evaluationId} (diff: pro=${diffs.proDiff}, con=${diffs.conDiff})`);

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
 * Uses atomic FieldValue.increment to reverse counters and a transaction for consensus.
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

    // Read existing evaluation to compute reverse diff
    const evalSnap = await db.collection(Collections.evaluations).doc(evaluationId).get();
    if (!evalSnap.exists) {
      return NextResponse.json(
        { error: 'Evaluation not found' },
        { status: 404 }
      );
    }

    const oldEval = evalSnap.data()?.evaluation || 0;

    // Mark with source before deleting so Firebase function skips the trigger
    await db.collection(Collections.evaluations).doc(evaluationId).update({ source: 'sign' });
    await db.collection(Collections.evaluations).doc(evaluationId).delete();

    // Compute reverse diffs (newEval = 0 since we're removing) and atomically update
    const diffs = computeEvalDiffs(oldEval, 0);
    await atomicUpdateStatement(db, suggestionId, diffs, false);

    logger.info(`[Suggestion Evaluations API] Deleted evaluation: ${evaluationId} (reversed: pro=${diffs.proDiff}, con=${diffs.conDiff})`);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Suggestion Evaluations API] DELETE error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
