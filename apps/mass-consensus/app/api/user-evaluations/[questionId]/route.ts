import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, UserEvaluation } from '@freedi/shared-types';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { logError } from '@/lib/utils/errorHandling';

/**
 * GET /api/user-evaluations/[questionId]
 * Get user's evaluation tracking data for a question
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  const { questionId } = await params;

  try {
    // Get user ID from request
    const url = new URL(request.url);
    const bodyUserId = url.searchParams.get('userId');
    const cookieUserId = getUserIdFromCookie(request.headers.get('cookie'));
    const userId = bodyUserId || cookieUserId;

    if (!userId) {
      return NextResponse.json({
        evaluatedOptionsIds: [],
        totalEvaluated: 0,
      });
    }
    const userEvaluationId = `${userId}--${questionId}`;

    const db = getFirestoreAdmin();
    const userEvaluationDoc = await db
      .collection(Collections.userEvaluations)
      .doc(userEvaluationId)
      .get();

    if (!userEvaluationDoc.exists) {
      // Return empty state if no evaluations yet
      return NextResponse.json({
        evaluatedOptionsIds: [],
        totalEvaluated: 0,
      });
    }

    const data = userEvaluationDoc.data() as UserEvaluation;

    return NextResponse.json({
      evaluatedOptionsIds: data.evaluatedOptionsIds || [],
      totalEvaluated: data.evaluatedOptionsIds?.length || 0,
      lastUpdated: data.lastUpdated,
    });
  } catch (error) {
    logError(error, {
      operation: 'api.userEvaluations',
      metadata: { questionId },
    });

    return NextResponse.json(
      {
        error: 'Failed to get user evaluations',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}