import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

interface EvaluationInput {
  evaluation: number; // -1 or 1
  visitorId?: string; // For anonymous users
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

    // Get visitorId from query params for anonymous users
    const { searchParams } = new URL(request.url);
    const visitorId = searchParams.get('visitorId');

    // Use userId if authenticated, otherwise use visitorId
    const effectiveId = userId || visitorId;

    const db = getFirestoreAdmin();

    // Get all evaluations for this comment
    const snapshot = await db
      .collection(Collections.evaluations)
      .where('statementId', '==', commentId)
      .get();

    let sumEvaluation = 0;
    let userEvaluation: number | null = null;

    snapshot.docs.forEach((doc) => {
      const evalData = doc.data();
      sumEvaluation += evalData.evaluation || 0;

      // Check if this is the current user's/visitor's evaluation
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
 * Create or update an evaluation for a comment
 * Supports both authenticated users and anonymous visitors
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

    // Use userId if authenticated, otherwise use visitorId for anonymous users
    const effectiveId = userId || visitorId;

    if (!effectiveId) {
      return NextResponse.json(
        { error: 'User ID or visitor ID is required' },
        { status: 400 }
      );
    }

    // Validate evaluation value (-1 or 1)
    if (evaluation !== -1 && evaluation !== 1) {
      return NextResponse.json(
        { error: 'Evaluation must be -1 or 1' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // Get the comment to verify it exists and get parentId
    const commentRef = await db.collection(Collections.statements).doc(commentId).get();

    if (!commentRef.exists) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    const comment = commentRef.data();

    // Users cannot evaluate their own comments
    if (comment?.creatorId === effectiveId) {
      return NextResponse.json(
        { error: 'Cannot evaluate your own comment' },
        { status: 403 }
      );
    }

    // Get display name - for anonymous users, generate one from visitorId
    const isAnonymous = !userId;
    const displayName = isAnonymous
      ? getAnonymousDisplayName(effectiveId)
      : getUserDisplayNameFromCookie(cookieHeader) || getAnonymousDisplayName(effectiveId);

    // Evaluation ID follows main app pattern: ${effectiveId}--${statementId}
    const evaluationId = `${effectiveId}--${commentId}`;

    const evaluationData = {
      evaluationId,
      statementId: commentId,
      parentId: comment?.parentId || commentId,
      documentId: comment?.topParentId || '',
      evaluatorId: effectiveId,
      evaluation,
      updatedAt: Date.now(),
      isAnonymous,
      evaluator: {
        displayName,
        uid: effectiveId,
      },
    };

    await db.collection(Collections.evaluations).doc(evaluationId).set(evaluationData);

    // Recalculate consensus from all evaluations (more reliable than incremental updates)
    const allEvaluationsSnapshot = await db
      .collection(Collections.evaluations)
      .where('statementId', '==', commentId)
      .get();

    let newConsensus = 0;
    allEvaluationsSnapshot.docs.forEach((doc) => {
      const evalData = doc.data();
      newConsensus += evalData.evaluation || 0;
    });

    await db.collection(Collections.statements).doc(commentId).update({
      consensus: newConsensus,
      lastUpdate: Date.now(),
    });

    logger.info(`[Evaluations API] Created/updated evaluation: ${evaluationId} (anonymous: ${isAnonymous})`);

    return NextResponse.json({
      success: true,
      evaluation: evaluationData,
      newConsensus,
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
 * Remove user's evaluation from a comment
 * Supports both authenticated users and anonymous visitors
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    // Get visitorId from query params for anonymous users
    const { searchParams } = new URL(request.url);
    const visitorId = searchParams.get('visitorId');

    // Use userId if authenticated, otherwise use visitorId
    const effectiveId = userId || visitorId;

    if (!effectiveId) {
      return NextResponse.json(
        { error: 'User ID or visitor ID is required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    const evaluationId = `${effectiveId}--${commentId}`;

    // Get existing evaluation
    const evalRef = await db.collection(Collections.evaluations).doc(evaluationId).get();

    if (!evalRef.exists) {
      return NextResponse.json(
        { error: 'Evaluation not found' },
        { status: 404 }
      );
    }

    // Delete the evaluation
    await db.collection(Collections.evaluations).doc(evaluationId).delete();

    // Recalculate consensus from remaining evaluations
    const remainingEvaluationsSnapshot = await db
      .collection(Collections.evaluations)
      .where('statementId', '==', commentId)
      .get();

    let newConsensus = 0;
    remainingEvaluationsSnapshot.docs.forEach((doc) => {
      const evalData = doc.data();
      newConsensus += evalData.evaluation || 0;
    });

    await db.collection(Collections.statements).doc(commentId).update({
      consensus: newConsensus,
      lastUpdate: Date.now(),
    });

    logger.info(`[Evaluations API] Deleted evaluation: ${evaluationId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Evaluations API] DELETE error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
