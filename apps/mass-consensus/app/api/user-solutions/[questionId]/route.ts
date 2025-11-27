import { NextRequest, NextResponse } from 'next/server';
import { getUserSolutions } from '@/lib/firebase/queries';
import { getUserIdFromCookie } from '@/lib/utils/user';
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
    const url = new URL(request.url);
    const bodyUserId = url.searchParams.get('userId');
    const cookieUserId = getUserIdFromCookie(request.headers.get('cookie'));
    const userId = bodyUserId || cookieUserId;

    if (!userId) {
      return NextResponse.json({
        hasSubmitted: false,
        solutionCount: 0,
      });
    }

    const questionId = params.questionId;
    const userSolutions = await getUserSolutions(questionId, userId);

    return NextResponse.json({
      hasSubmitted: userSolutions.length > 0,
      solutionCount: userSolutions.length,
    });
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
