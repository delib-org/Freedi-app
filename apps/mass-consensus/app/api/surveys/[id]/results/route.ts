import { NextRequest, NextResponse } from 'next/server';
import {
  getSurveyById,
  getSurveyWithQuestions,
  getAllSurveyDemographicQuestions,
  getAllSurveyDemographicAnswers,
} from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { logger } from '@/lib/utils/logger';
import { UserDemographicQuestion } from '@freedi/shared-types';

interface DemographicOptionCount {
  option: string;
  count: number;
}

interface DemographicQuestionResult {
  userQuestionId: string;
  question: string;
  type: string;
  totalResponses: number;
  optionCounts?: DemographicOptionCount[];
  numericStats?: {
    min: number;
    max: number;
    average: number;
  };
}

/**
 * Aggregate demographic answers by question
 */
function aggregateDemographicAnswers(
  questions: UserDemographicQuestion[],
  answers: UserDemographicQuestion[]
): DemographicQuestionResult[] {
  return questions.map((question) => {
    const questionAnswers = answers.filter(
      (a) => a.userQuestionId === question.userQuestionId
    );

    const result: DemographicQuestionResult = {
      userQuestionId: question.userQuestionId || '',
      question: question.question,
      type: question.type,
      totalResponses: questionAnswers.length,
    };

    // Aggregate based on type
    if (['radio', 'checkbox', 'dropdown'].includes(question.type)) {
      const counts = new Map<string, number>();

      // Initialize with all options from the question
      if (question.options) {
        for (const opt of question.options) {
          counts.set(opt.option, 0);
        }
      }

      // Count answers
      for (const ans of questionAnswers) {
        if (ans.answerOptions && ans.answerOptions.length > 0) {
          for (const selected of ans.answerOptions) {
            counts.set(selected, (counts.get(selected) || 0) + 1);
          }
        } else if (ans.answer) {
          counts.set(ans.answer, (counts.get(ans.answer) || 0) + 1);
        }
      }

      result.optionCounts = Array.from(counts.entries()).map(([option, count]) => ({
        option,
        count,
      }));
    } else if (['range', 'number'].includes(question.type)) {
      const numericValues = questionAnswers
        .map((a) => parseFloat(a.answer || ''))
        .filter((v) => !isNaN(v));

      if (numericValues.length > 0) {
        result.numericStats = {
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          average:
            Math.round(
              (numericValues.reduce((sum, v) => sum + v, 0) / numericValues.length) * 100
            ) / 100,
        };
      }
    }

    return result;
  });
}

/**
 * GET /api/surveys/[id]/results
 * Get survey results: questions with links and demographic aggregated data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;

    // Extract and verify token
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Verify user owns this survey
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    if (survey.creatorId !== userId) {
      return NextResponse.json({ error: 'You can only view results for your own surveys' }, { status: 403 });
    }

    // Fetch questions and demographics in parallel
    const [surveyWithQuestions, demographicQuestions, demographicAnswers] = await Promise.all([
      getSurveyWithQuestions(surveyId),
      getAllSurveyDemographicQuestions(surveyId),
      getAllSurveyDemographicAnswers(surveyId),
    ]);

    // Build question results with statement text
    const questions = (surveyWithQuestions?.questions || []).map((statement, index) => ({
      index: index + 1,
      statementId: statement.statementId,
      statement: statement.statement,
    }));

    // Aggregate demographic answers
    const demographics = aggregateDemographicAnswers(demographicQuestions, demographicAnswers);

    return NextResponse.json({ questions, demographics });
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/results] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch survey results' },
      { status: 500 }
    );
  }
}
