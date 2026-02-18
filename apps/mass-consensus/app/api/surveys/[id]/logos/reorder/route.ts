import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';
import { getSurveyById, reorderSurveyLogos } from '@/lib/firebase/surveys';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Role } from '@freedi/shared-types';
import type { ReorderLogosRequest } from '@/types/survey';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';

/**
 * POST /api/surveys/[id]/logos/reorder
 * Reorder logos in a survey
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Rate limit check
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.STANDARD);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const surveyId = params.id;

    // Check authentication via Bearer token
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Verify survey exists
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }

    // Check if user is creator or has admin role
    const isCreator = survey.creatorId === userId;
    let isAdmin = false;

    if (!isCreator) {
      // Check if user has admin subscription to this survey
      const db = getFirestoreAdmin();
      const adminSubscription = await db
        .collection(Collections.statementsSubscribe)
        .where('statementId', '==', surveyId)
        .where('userId', '==', userId)
        .where('role', '==', Role.admin)
        .limit(1)
        .get();

      isAdmin = !adminSubscription.empty;
    }

    if (!isCreator && !isAdmin) {
      return NextResponse.json(
        { error: 'Only survey creator or admin can reorder logos' },
        { status: 403 }
      );
    }

    // Parse request body
    const { logoIds }: ReorderLogosRequest = await request.json();

    if (!Array.isArray(logoIds)) {
      return NextResponse.json(
        { error: 'logoIds must be an array' },
        { status: 400 }
      );
    }

    // Reorder logos
    const updatedSurvey = await reorderSurveyLogos(surveyId, logoIds);

    if (!updatedSurvey) {
      return NextResponse.json(
        { error: 'Failed to reorder logos' },
        { status: 500 }
      );
    }

    logger.info('[POST /api/surveys/[id]/logos/reorder] Logos reordered for survey:', surveyId);

    return NextResponse.json({
      logos: updatedSurvey.logos || [],
      message: 'Logos reordered successfully',
    });

  } catch (error) {
    logger.error('[POST /api/surveys/[id]/logos/reorder] Error:', error);
    return NextResponse.json(
      { error: 'Failed to reorder logos' },
      { status: 500 }
    );
  }
}
