import { NextRequest, NextResponse } from 'next/server';
import {
  getAllSurveyDemographicQuestions,
  batchSaveDemographicQuestions,
  deleteSurveyDemographicQuestion,
  getSurveyById,
  updateSurvey,
} from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import type { UserDemographicQuestion } from '@freedi/shared-types';
import type { SurveyDemographicPage } from '@/types/survey';
import { logger } from '@/lib/utils/logger';

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/surveys/[id]/demographics - Get all demographic questions for a survey
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const surveyId = context.params.id;

    const questions = await getAllSurveyDemographicQuestions(surveyId);
    const survey = await getSurveyById(surveyId);

    return NextResponse.json({
      questions,
      demographicPages: survey?.demographicPages || [],
    });
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/demographics] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch demographic questions' },
      { status: 500 }
    );
  }
}

interface UpdateDemographicsRequest {
  demographicPages?: SurveyDemographicPage[];
  questions?: Array<{
    questionId?: string;
    /** Temporary ID used by the client for new questions */
    tempId?: string;
    question: string;
    type: UserDemographicQuestion['type'];
    options?: UserDemographicQuestion['options'];
    order?: number;
    required?: boolean;
    // Range-specific fields
    min?: number;
    max?: number;
    step?: number;
    minLabel?: string;
    maxLabel?: string;
    allowOther?: boolean;
  }>;
}

/**
 * POST /api/surveys/[id]/demographics - Create or update demographic configuration
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const surveyId = context.params.id;
    const token = extractBearerToken(request.headers.get('Authorization'));

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    logger.info(`[POST demographics] User ID from token: ${userId}`);

    // Verify user owns the survey
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }

    logger.info(`[POST demographics] Survey creatorId: ${survey.creatorId}`);

    if (survey.creatorId !== userId) {
      logger.warn(`[POST demographics] Mismatch: creatorId=${survey.creatorId}, userId=${userId}`);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const body: UpdateDemographicsRequest = await request.json();

    // Batch save all questions in a single Firestore operation (much faster)
    let savedQuestions: UserDemographicQuestion[] = [];
    let idMapping: Record<string, string> = {};

    if (body.questions && body.questions.length > 0) {
      const result = await batchSaveDemographicQuestions(surveyId, body.questions);
      savedQuestions = result.savedQuestions;
      idMapping = result.idMapping;
    }

    // Update demographic pages with the new question IDs
    let updatedPages = body.demographicPages;
    if (updatedPages && Object.keys(idMapping).length > 0) {
      updatedPages = updatedPages.map((page) => ({
        ...page,
        customQuestionIds: page.customQuestionIds.map((id) =>
          idMapping[id] || id
        ),
      }));
    }

    // Save demographic pages with updated question IDs
    if (updatedPages !== undefined) {
      await updateSurvey(surveyId, {
        demographicPages: updatedPages,
      } as Record<string, SurveyDemographicPage[]>);
    }

    logger.info('[POST /api/surveys/[id]/demographics] Updated demographics for survey:', surveyId);
    logger.info('[POST /api/surveys/[id]/demographics] ID mapping:', JSON.stringify(idMapping));

    return NextResponse.json({
      success: true,
      demographicPages: updatedPages,
      questions: savedQuestions,
      idMapping,
    });
  } catch (error) {
    logger.error('[POST /api/surveys/[id]/demographics] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update demographic configuration' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/surveys/[id]/demographics?questionId=xxx - Delete a demographic question
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const surveyId = context.params.id;
    const token = extractBearerToken(request.headers.get('Authorization'));

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Verify user owns the survey
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }

    if (survey.creatorId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const questionId = searchParams.get('questionId');

    if (!questionId) {
      return NextResponse.json(
        { error: 'questionId is required' },
        { status: 400 }
      );
    }

    const success = await deleteSurveyDemographicQuestion(questionId);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete question' },
        { status: 500 }
      );
    }

    logger.info('[DELETE /api/surveys/[id]/demographics] Deleted question:', questionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[DELETE /api/surveys/[id]/demographics] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete demographic question' },
      { status: 500 }
    );
  }
}
