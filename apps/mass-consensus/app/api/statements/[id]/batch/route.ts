import { NextRequest, NextResponse } from 'next/server';
import { getAdaptiveBatch, getRandomOptions } from '@/lib/firebase/queries';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { logError } from '@/lib/utils/errorHandling';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/statements/[id]/batch
 * Get adaptive batch of solutions for a question using Thompson Sampling
 *
 * The server handles all filtering:
 * - User's evaluation history (excludes already-evaluated proposals)
 * - Stable proposals (excludes proposals with low uncertainty)
 * - Priority scoring (prioritizes under-evaluated and uncertain proposals)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit check
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.READ);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { id: questionId } = await params;
    const body = await request.json();
    const { userId: bodyUserId, size = 6, useAdaptive = true } = body;

    // Get user ID from cookie or body
    const cookieUserId = getUserIdFromCookie(request.headers.get('cookie'));
    const userId = bodyUserId || cookieUserId;

    logger.info('[batch/route] Processing batch request:', {
      questionId,
      userId,
      size,
      useAdaptive,
    });

    // Validate
    if (!questionId) {
      return NextResponse.json(
        { error: 'Question ID is required' },
        { status: 400 }
      );
    }

    // Use adaptive batch if userId is provided, fallback to random for anonymous
    if (useAdaptive && userId) {
      // Adaptive sampling with Thompson Sampling
      const result = await getAdaptiveBatch(questionId, userId, { size });

      logger.info('[batch/route] Adaptive batch result:', {
        solutionCount: result.solutions.length,
        hasMore: result.hasMore,
        stats: result.stats,
      });

      return NextResponse.json({
        solutions: result.solutions,
        hasMore: result.hasMore,
        count: result.solutions.length,
        stats: result.stats,
        method: 'adaptive',
      });
    } else {
      // Fallback to random selection for anonymous users
      logger.info('[batch/route] Using random fallback (no userId)');

      const solutions = await getRandomOptions(questionId, {
        size,
        userId: userId || undefined,
      });

      return NextResponse.json({
        solutions,
        hasMore: solutions.length >= size,
        count: solutions.length,
        method: 'random',
      });
    }
  } catch (error) {
    const { id: questionId } = await params;

    logError(error, {
      operation: 'api.batch',
      metadata: { questionId },
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
