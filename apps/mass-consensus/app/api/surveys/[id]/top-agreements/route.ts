import { NextRequest, NextResponse } from 'next/server';
import { getSurveyById, getSurveyWithQuestions } from '@/lib/firebase/surveys';
import { getAllSolutionsSorted } from '@/lib/firebase/queries';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { denySurveyPermission } from '@/lib/auth/surveyAccess';
import { logger } from '@/lib/utils/logger';
import { selectTopAgreements, QuestionTopAgreements } from '@/lib/utils/topAgreements';
import { TOP_AGREEMENTS } from '@/constants/common';

/**
 * GET /api/surveys/[id]/top-agreements
 * Admin-only: the highest-consensus options of every question in the survey.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;

    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const denied = await denySurveyPermission(survey, userId, 'view');
    if (denied) return denied;

    const surveyWithQuestions = await getSurveyWithQuestions(surveyId);
    const questions = surveyWithQuestions?.questions ?? [];

    const result: QuestionTopAgreements[] = await Promise.all(
      questions.map(async (question) => {
        const solutions = await getAllSolutionsSorted(
          question.statementId,
          TOP_AGREEMENTS.MAX_PER_QUESTION
        );

        return {
          statementId: question.statementId,
          statement: question.statement,
          options: selectTopAgreements(solutions, TOP_AGREEMENTS.MAX_PER_QUESTION),
        };
      })
    );

    return NextResponse.json({ questions: result });
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/top-agreements] Error:', error);

    return NextResponse.json({ error: 'Failed to fetch top agreements' }, { status: 500 });
  }
}
