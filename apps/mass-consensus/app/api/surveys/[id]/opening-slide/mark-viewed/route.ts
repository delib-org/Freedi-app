import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedUserId, unauthorizedResponse } from '@/lib/auth/requestIdentity';
import { markOpeningSlideViewed } from '@/lib/firebase/surveys';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/surveys/[id]/opening-slide/mark-viewed
 * Mark opening slide as viewed for current user
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const surveyId = params.id;

    // Verified ID token only (anonymous Firebase users have one too)
    const userId = await getVerifiedUserId(request);
    if (!userId) {
      return unauthorizedResponse();
    }

    await markOpeningSlideViewed(surveyId, userId);

    logger.info('[POST /api/surveys/[id]/opening-slide/mark-viewed] Marked as viewed:', userId);

    return NextResponse.json({
      message: 'Opening slide marked as viewed',
    });

  } catch (error) {
    logger.error('[POST /api/surveys/[id]/opening-slide/mark-viewed] Error:', error);
    return NextResponse.json(
      { error: 'Failed to mark as viewed' },
      { status: 500 }
    );
  }
}
