import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { logResearchAction } from '@/lib/utils/researchLogger';
import { ResearchAction } from '@freedi/shared-types';

interface EvaluationInput {
  evaluation: number; // -1 or 1
  visitorId?: string; // For anonymous users
}

/**
 * Atomically updates the comment's consensus score using FieldValue.increment
 * and a transaction to read back the final value.
 * Comments use simple sum consensus (not Mean-SEM like suggestions).
 */
async function atomicUpdateCommentConsensus(
  db: FirebaseFirestore.Firestore,
  commentId: string,
  evalDiff: number,
): Promise<void> {
  const statementRef = db.collection(Collections.statements).doc(commentId);

  // Atomic increment for consensus (simple sum for comments)
  await statementRef.update({
    consensus: FieldValue.increment(evalDiff),
    lastUpdate: Date.now(),
  });
}

/**
 * GET /api/evaluations/[commentId]
 * Get evaluations for a comment and the current user's evaluation
 * Supports both authenticated users and anonymous visitors
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId } = await params;
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    const { searchParams } = new URL(request.url);
    const visitorId = searchParams.get('visitorId');
    const effectiveId = userId || visitorId;

    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.evaluations)
      .where('statementId', '==', commentId)
      .get();

    let sumEvaluation = 0;
    let userEvaluation: number | null = null;

    snapshot.docs.forEach((doc) => {
      const evalData = doc.data();
      sumEvaluation += evalData.evaluation || 0;

      if (effectiveId && evalData.evaluatorId === effectiveId) {
        userEvaluation = evalData.evaluation;
      }
    });

    return NextResponse.json({
      sumEvaluation,
      userEvaluation,
      evaluationCount: snapshot.docs.length,
    });
  } catch (error) {
    logger.error('[Evaluations API] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/evaluations/[commentId]
 * Create or update an evaluation for a comment.
 * Uses atomic FieldValue.increment for consensus (simple sum).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId } = await params;
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    const body: EvaluationInput = await request.json();
    const { evaluation, visitorId } = body;

    const effectiveId = userId || visitorId;

    if (!effectiveId) {
      return NextResponse.json(
        { error: 'User ID or visitor ID is required' },
        { status: 400 }
      );
    }

    if (evaluation !== -1 && evaluation !== 1) {
      return NextResponse.json(
        { error: 'Evaluation must be -1 or 1' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    const commentRef = await db.collection(Collections.statements).doc(commentId).get();
    if (!commentRef.exists) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    const comment = commentRef.data();

    if (comment?.creatorId === effectiveId) {
      return NextResponse.json(
        { error: 'Cannot evaluate your own comment' },
        { status: 403 }
      );
    }

    // Read old evaluation to compute diff
    const evaluationId = `${effectiveId}--${commentId}`;
    const oldEvalSnap = await db.collection(Collections.evaluations).doc(evaluationId).get();
    const oldEval = oldEvalSnap.exists ? (oldEvalSnap.data()?.evaluation || 0) : 0;
    const evalDiff = evaluation - oldEval;

    const isAnonymous = !userId;
    const displayName = isAnonymous
      ? getAnonymousDisplayName(effectiveId)
      : getUserDisplayNameFromCookie(cookieHeader) || getAnonymousDisplayName(effectiveId);

    const evaluationData = {
      evaluationId,
      statementId: commentId,
      parentId: comment?.parentId || commentId,
      documentId: comment?.topParentId || '',
      evaluatorId: effectiveId,
      evaluation,
      updatedAt: Date.now(),
      isAnonymous,
      source: 'sign' as const,
      evaluator: {
        displayName,
        uid: effectiveId,
      },
    };

    // Write evaluation doc
    await db.collection(Collections.evaluations).doc(evaluationId).set(evaluationData);

    // Atomically update consensus
    await atomicUpdateCommentConsensus(db, commentId, evalDiff);

    // Research logging — check top-level document's settings
    const topDocId = comment?.topParentId || commentId;
    const topDocForResearch = await db.collection(Collections.statements).doc(topDocId).get();
    const researchEnabled = topDocForResearch.data()?.statementSettings?.enableResearchLogging === true;
    logResearchAction(effectiveId, ResearchAction.EVALUATE, researchEnabled, {
      statementId: commentId,
      topParentId: comment?.topParentId,
      newValue: String(evaluation),
      previousValue: oldEvalSnap.exists ? String(oldEval) : undefined,
    });

    logger.info(`[Evaluations API] ${oldEvalSnap.exists ? 'Updated' : 'Created'} evaluation: ${evaluationId} (anonymous: ${isAnonymous}, diff: ${evalDiff})`);

    return NextResponse.json({
      success: true,
      evaluation: evaluationData,
    });
  } catch (error) {
    logger.error('[Evaluations API] POST error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/evaluations/[commentId]
 * Remove user's evaluation from a comment.
 * Uses atomic FieldValue.increment to reverse the evaluation's contribution to consensus.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    const { searchParams } = new URL(request.url);
    const visitorId = searchParams.get('visitorId');
    const effectiveId = userId || visitorId;

    if (!effectiveId) {
      return NextResponse.json(
        { error: 'User ID or visitor ID is required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();
    const evaluationId = `${effectiveId}--${commentId}`;

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

    // Atomically reverse the evaluation's contribution to consensus
    await atomicUpdateCommentConsensus(db, commentId, -oldEval);

    logger.info(`[Evaluations API] Deleted evaluation: ${evaluationId} (reversed: ${-oldEval})`);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Evaluations API] DELETE error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
