import { NextRequest, NextResponse } from 'next/server';
import { getRandomOptions } from '@/lib/firebase/queries';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { logError } from '@/lib/utils/errorHandling';

/**
 * POST /api/statements/[id]/batch
 * Get random batch of solutions for a question
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { userId: bodyUserId, excludeIds = [] } = body;

    // Get user ID from cookie or body
    const cookieUserId = getUserIdFromCookie(request.headers.get('cookie'));
    const userId = bodyUserId || cookieUserId;

    const questionId = params.id;

    // Validate
    if (!questionId) {
      return NextResponse.json(
        { error: 'Question ID is required' },
        { status: 400 }
      );
    }

    // Fetch random batch
    const solutions = await getRandomOptions(questionId, {
      size: 6,
      userId: userId || undefined,
      excludeIds,
    });

    return NextResponse.json({
      solutions,
      hasMore: solutions.length >= 6,
      count: solutions.length,
    });
  } catch (error) {
    logError(error, {
      operation: 'api.batch',
      metadata: { questionId: params.id },
    });

    return NextResponse.json(
      {
        error: 'Failed to fetch batch',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
