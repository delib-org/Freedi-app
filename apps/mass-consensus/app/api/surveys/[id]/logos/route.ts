import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';
import { getSurveyById, addLogoToSurvey } from '@/lib/firebase/surveys';
import { uploadSurveyLogoAdmin } from '@/lib/firebase/storageAdmin';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Role } from 'delib-npm';

/**
 * GET /api/surveys/[id]/logos
 * Get all logos for a survey
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const surveyId = params.id;

    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      logos: survey.logos || [],
    });
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/logos] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch logos' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/surveys/[id]/logos
 * Upload a new logo for a survey
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

    // Check authentication
    const userId = getUserIdFromCookie(request.headers.get('cookie'));
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
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

    logger.info('[POST /api/surveys/[id]/logos] Authorization check:', {
      userId,
      creatorId: survey.creatorId,
      isCreator,
      surveyId
    });

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
      logger.info('[POST /api/surveys/[id]/logos] Admin check:', {
        isAdmin,
        subscriptionCount: adminSubscription.size
      });
    }

    if (!isCreator && !isAdmin) {
      logger.error('[POST /api/surveys/[id]/logos] Authorization failed:', {
        userId,
        creatorId: survey.creatorId,
        isCreator,
        isAdmin
      });
      return NextResponse.json(
        { error: 'Only survey creator or admin can upload logos' },
        { status: 403 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const altText = formData.get('altText') as string || '';
    const orderStr = formData.get('order') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      );
    }

    // Determine order (if not provided, put at end)
    const currentLogos = survey.logos || [];
    const order = orderStr ? parseInt(orderStr, 10) : currentLogos.length;

    // Upload to Firebase Storage using Admin SDK
    const logo = await uploadSurveyLogoAdmin(surveyId, file, altText, order);

    // Add to survey document
    const updatedSurvey = await addLogoToSurvey(surveyId, logo);

    if (!updatedSurvey) {
      return NextResponse.json(
        { error: 'Failed to update survey' },
        { status: 500 }
      );
    }

    logger.info('[POST /api/surveys/[id]/logos] Logo uploaded:', logo.logoId);

    return NextResponse.json({
      logo,
      message: 'Logo uploaded successfully',
    }, { status: 201 });

  } catch (error) {
    logger.error('[POST /api/surveys/[id]/logos] Error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Invalid file type') || error.message.includes('File too large')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to upload logo' },
      { status: 500 }
    );
  }
}
