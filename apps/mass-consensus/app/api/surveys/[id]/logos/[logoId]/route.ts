import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';
import { getSurveyById, removeLogoFromSurvey, updateLogoInSurvey } from '@/lib/firebase/surveys';
import { deleteSurveyLogoAdmin } from '@/lib/firebase/storageAdmin';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Role } from '@freedi/shared-types';
import type { UpdateLogoRequest } from '@/types/survey';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';

/**
 * DELETE /api/surveys/[id]/logos/[logoId]
 * Delete a logo from a survey
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; logoId: string } }
) {
  // Rate limit check
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.STANDARD);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const surveyId = params.id;
    const { logoId } = params;

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
        { error: 'Only survey creator or admin can delete logos' },
        { status: 403 }
      );
    }

    // Find logo to get storage URL
    const logo = survey.logos?.find((l) => l.logoId === logoId);
    if (!logo) {
      return NextResponse.json(
        { error: 'Logo not found' },
        { status: 404 }
      );
    }

    // Delete from Firebase Storage using Admin SDK
    await deleteSurveyLogoAdmin(logo.storageUrl);

    // Remove from survey document
    const updatedSurvey = await removeLogoFromSurvey(surveyId, logoId);

    if (!updatedSurvey) {
      return NextResponse.json(
        { error: 'Failed to update survey' },
        { status: 500 }
      );
    }

    logger.info('[DELETE /api/surveys/[id]/logos/[logoId]] Logo deleted:', logoId);

    return NextResponse.json({
      message: 'Logo deleted successfully',
    });

  } catch (error) {
    logger.error('[DELETE /api/surveys/[id]/logos/[logoId]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete logo' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/surveys/[id]/logos/[logoId]
 * Update logo metadata (alt text, order, dimensions)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; logoId: string } }
) {
  // Rate limit check
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.STANDARD);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const surveyId = params.id;
    const { logoId } = params;

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
        { error: 'Only survey creator or admin can update logos' },
        { status: 403 }
      );
    }

    // Parse request body
    const updates: UpdateLogoRequest = await request.json();

    // Update logo in survey
    const updatedSurvey = await updateLogoInSurvey(surveyId, logoId, updates);

    if (!updatedSurvey) {
      return NextResponse.json(
        { error: 'Failed to update logo' },
        { status: 500 }
      );
    }

    // Find updated logo
    const updatedLogo = updatedSurvey.logos?.find((l) => l.logoId === logoId);

    logger.info('[PATCH /api/surveys/[id]/logos/[logoId]] Logo updated:', logoId);

    return NextResponse.json({
      logo: updatedLogo,
      message: 'Logo updated successfully',
    });

  } catch (error) {
    logger.error('[PATCH /api/surveys/[id]/logos/[logoId]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update logo' },
      { status: 500 }
    );
  }
}
