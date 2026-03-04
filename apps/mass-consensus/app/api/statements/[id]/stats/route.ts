import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

/**
 * GET /api/statements/[id]/stats
 * Get statistics for a statement (participant count, etc.)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: statementId } = await params;
    const db = getFirestoreAdmin();

    // Count unique evaluators (participants who have evaluated solutions for this question)
    const evaluationsQuery = await db
      .collection(Collections.evaluations)
      .where('parentId', '==', statementId)
      .get();

    // Get unique evaluator IDs
    const uniqueEvaluators = new Set<string>();
    evaluationsQuery.docs.forEach((doc) => {
      const data = doc.data();
      if (data.evaluatorId) {
        uniqueEvaluators.add(data.evaluatorId);
      }
    });

    // Also count unique solution creators
    const solutionsQuery = await db
      .collection(Collections.statements)
      .where('parentId', '==', statementId)
      .get();

    const uniqueCreators = new Set<string>();
    solutionsQuery.docs.forEach((doc) => {
      const data = doc.data();
      if (data.creatorId) {
        uniqueCreators.add(data.creatorId);
      }
    });

    // Total unique participants = evaluators + creators (union)
    const allParticipants = new Set([...uniqueEvaluators, ...uniqueCreators]);

    return NextResponse.json({
      participantCount: allParticipants.size,
      evaluatorCount: uniqueEvaluators.size,
      creatorCount: uniqueCreators.size,
      totalEvaluations: evaluationsQuery.size,
      totalSolutions: solutionsQuery.size,
    });
  } catch (error) {
    logError(error, {
      operation: 'api.stats',
    });

    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
