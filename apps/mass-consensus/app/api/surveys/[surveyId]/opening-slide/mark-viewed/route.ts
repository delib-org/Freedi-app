import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { markOpeningSlideViewed } from '@/lib/firebase/surveys';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/surveys/[surveyId]/opening-slide/mark-viewed
 * Mark opening slide as viewed for current user
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  try {
    const { surveyId } = params;

    // Get user ID (can be authenticated or anonymous)
    const userId = getUserIdFromCookie(request.headers.get('cookie'));
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    await markOpeningSlideViewed(surveyId, userId);

    logger.info('[POST /api/surveys/[surveyId]/opening-slide/mark-viewed] Marked as viewed:', userId);

    return NextResponse.json({
      message: 'Opening slide marked as viewed',
    });

  } catch (error) {
    logger.error('[POST /api/surveys/[surveyId]/opening-slide/mark-viewed] Error:', error);
    return NextResponse.json(
      { error: 'Failed to mark as viewed' },
      { status: 500 }
    );
  }
}
