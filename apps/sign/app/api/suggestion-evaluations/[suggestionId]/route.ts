import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import { Collections, calcBinaryConsensus } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

interface EvaluationInput {
  evaluation: number; // -1 or 1
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

    // Get all evaluations for this suggestion
    const snapshot = await db
      .collection(Collections.evaluations)
      .where('statementId', '==', suggestionId)
      .get();

    let sumEvaluation = 0;
    let positiveEvaluations = 0;
    let negativeEvaluations = 0;
    let userEvaluation: number | null = null;

    snapshot.docs.forEach((doc) => {
      const evalData = doc.data();
      const evalValue = evalData.evaluation || 0;
      sumEvaluation += evalValue;

      if (evalValue > 0) {
        positiveEvaluations++;
      } else if (evalValue < 0) {
        negativeEvaluations++;
      }

      // Check if this is the current user's evaluation
      if (userId && evalData.evaluatorId === userId) {
        userEvaluation = evalData.evaluation;
      }
    });

    return NextResponse.json({
      sumEvaluation,
      userEvaluation,
      evaluationCount: snapshot.docs.length,
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
 * Create or update an evaluation for a suggestion
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

    // Get the suggestion (stored as Statement) to verify it exists and get creatorId
    const suggestionRef = await db.collection(Collections.statements).doc(suggestionId).get();

    if (!suggestionRef.exists) {
      return NextResponse.json(
        { error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    const suggestion = suggestionRef.data();

    // Users cannot evaluate their own suggestions
    if (suggestion?.creatorId === userId) {
      return NextResponse.json(
        { error: 'Cannot evaluate your own suggestion' },
        { status: 403 }
      );
    }

    // Get display name
    const displayName = getUserDisplayNameFromCookie(cookieHeader) || getAnonymousDisplayName(userId);

    // Evaluation ID follows pattern: ${userId}--${suggestionId}
    const evaluationId = `${userId}--${suggestionId}`;

    const evaluationData = {
      evaluationId,
      statementId: suggestionId, // Using statementId for compatibility with existing pattern
      suggestionId, // Explicit reference
      parentId: suggestion?.paragraphId || suggestionId,
      evaluatorId: userId,
      evaluation,
      updatedAt: Date.now(),
      evaluator: {
        displayName,
        uid: userId,
      },
    };

    await db.collection(Collections.evaluations).doc(evaluationId).set(evaluationData);

    // Recalculate consensus and vote counts from all evaluations (more reliable than incremental updates)
    const allEvaluationsSnapshot = await db
      .collection(Collections.evaluations)
      .where('statementId', '==', suggestionId)
      .get();

    let newConsensus = 0;
    let positiveEvaluations = 0;
    let negativeEvaluations = 0;

    allEvaluationsSnapshot.docs.forEach((doc) => {
      const evalData = doc.data();
      const evalValue = evalData.evaluation || 0;
      newConsensus += evalValue;

      if (evalValue > 0) {
        positiveEvaluations++;
      } else if (evalValue < 0) {
        negativeEvaluations++;
      }
    });

    // Calculate consensus score using Mean - SEM formula with uncertainty floor
    const consensusScore = calcBinaryConsensus(positiveEvaluations, negativeEvaluations);

    await db.collection(Collections.statements).doc(suggestionId).update({
      consensus: consensusScore,
      positiveEvaluations,
      negativeEvaluations,
      lastUpdate: Date.now(),
    });

    logger.info(`[Suggestion Evaluations API] Created/updated evaluation: ${evaluationId}`);

    return NextResponse.json({
      success: true,
      evaluation: evaluationData,
      newConsensus: consensusScore,
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
 * Remove user's evaluation from a suggestion
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

    // Delete the evaluation
    await db.collection(Collections.evaluations).doc(evaluationId).delete();

    // Recalculate consensus and vote counts from remaining evaluations
    const remainingEvaluationsSnapshot = await db
      .collection(Collections.evaluations)
      .where('statementId', '==', suggestionId)
      .get();

    let newConsensus = 0;
    let positiveEvaluations = 0;
    let negativeEvaluations = 0;

    remainingEvaluationsSnapshot.docs.forEach((doc) => {
      const evalData = doc.data();
      const evalValue = evalData.evaluation || 0;
      newConsensus += evalValue;

      if (evalValue > 0) {
        positiveEvaluations++;
      } else if (evalValue < 0) {
        negativeEvaluations++;
      }
    });

    // Calculate consensus score using Mean - SEM formula with uncertainty floor
    const consensusScore = calcBinaryConsensus(positiveEvaluations, negativeEvaluations);

    await db.collection(Collections.statements).doc(suggestionId).update({
      consensus: consensusScore,
      positiveEvaluations,
      negativeEvaluations,
      lastUpdate: Date.now(),
    });

    logger.info(`[Suggestion Evaluations API] Deleted evaluation: ${evaluationId}`);

    return NextResponse.json({ success: true, newConsensus: consensusScore });
  } catch (error) {
    logger.error('[Suggestion Evaluations API] DELETE error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
