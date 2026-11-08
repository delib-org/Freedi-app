import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedUserId } from '@/lib/auth/requestIdentity';
import { getUserSolutions, getQuestionFromFirebase } from '@/lib/firebase/queries';
import { summarizeUserSolutions } from '@/lib/utils/userSolutionSummary';
import { logError } from '@/lib/utils/errorHandling';

/**
 * GET /api/user-solutions/[questionId]
 * Check if user has submitted any solutions for this question
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { questionId: string } }
) {
  try {
    // Get user ID from request
    const userId = await getVerifiedUserId(request);

    if (!userId) {
      return NextResponse.json({
        hasSubmitted: false,
        solutionCount: 0,
      });
    }

    const questionId = params.questionId;

    const [userSolutions, question] = await Promise.all([
      getUserSolutions(questionId, userId),
      getQuestionFromFirebase(questionId).catch(() => null),
    ]);

    return NextResponse.json(
      summarizeUserSolutions(userId, question?.creatorId, userSolutions.length)
    );
  } catch (error) {
    logError(error, {
      operation: 'api.userSolutions',
      metadata: { questionId: params.questionId },
    });

    return NextResponse.json(
      {
        error: 'Failed to get user solutions',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
