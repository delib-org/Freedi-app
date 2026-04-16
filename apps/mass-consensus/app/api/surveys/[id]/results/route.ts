import { NextRequest, NextResponse } from 'next/server';
import {
  getSurveyById,
  getSurveyWithQuestions,
  getSurveyDemographicQuestions,
  getAllSurveyDemographicAnswers,
} from '@/lib/firebase/surveys';
import { SURVEY_PROGRESS_COLLECTION } from '@/lib/firebase/surveys/surveyHelpers';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { logger } from '@/lib/utils/logger';
import { Collections, StatementType, UserDemographicQuestion } from '@freedi/shared-types';
import { getFirestoreAdmin } from '@/lib/firebase/admin';

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

interface ParticipationStats {
  totalEntered: number;
  totalEvaluators: number;
  totalSolutionAdders: number;
}

/**
 * Get the set of user IDs who submitted evaluations for options
 * under the given parent statement IDs.
 */
async function getEvaluatorUserIds(parentStatementIds: string[]): Promise<Set<string>> {
  const db = getFirestoreAdmin();
  const evaluatorIds = new Set<string>();

  for (const parentId of parentStatementIds) {
    const snapshot = await db
      .collection(Collections.evaluations)
      .where('parentId', '==', parentId)
      .select('evaluatorId')
      .get();

    snapshot.forEach((doc) => {
      const evaluatorId = doc.data().evaluatorId;
      if (evaluatorId) {
        evaluatorIds.add(evaluatorId);
      }
    });
  }

  return evaluatorIds;
}

/**
 * Get the set of user IDs who added at least one solution (option statement)
 * under the given parent statement IDs.
 */
async function getSolutionAdderUserIds(parentStatementIds: string[]): Promise<Set<string>> {
  const db = getFirestoreAdmin();
  const adderIds = new Set<string>();

  for (const parentId of parentStatementIds) {
    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', parentId)
      .where('statementType', '==', StatementType.option)
      .select('creatorId')
      .get();

    snapshot.forEach((doc) => {
      const creatorId = doc.data().creatorId;
      if (creatorId) {
        adderIds.add(creatorId);
      }
    });
  }

  return adderIds;
}

/**
 * Return the set of user IDs that started the MC survey flow
 * (i.e. have a SurveyProgress doc). Excludes test data.
 */
async function getSurveyEntrantUserIds(surveyId: string): Promise<Set<string>> {
  const db = getFirestoreAdmin();
  const snapshot = await db
    .collection(SURVEY_PROGRESS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .select('userId', 'isTestData')
    .get();

  const ids = new Set<string>();
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.isTestData === true) return;
    if (data.userId) ids.add(data.userId);
  });

  return ids;
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

    // Scope demographic questions to those actually referenced by this
    // survey's current demographic pages. This prevents orphan/duplicate
    // docs left over from prior saves (same statementId, different
    // userQuestionIds) from surfacing in the results view.
    const currentDemographicQuestionIds = Array.from(
      new Set(
        (survey.demographicPages || []).flatMap((page) => page.customQuestionIds || [])
      )
    );

    // Fetch questions and demographics in parallel
    const [surveyWithQuestions, demographicQuestions, demographicAnswers] = await Promise.all([
      getSurveyWithQuestions(surveyId),
      getSurveyDemographicQuestions(surveyId, currentDemographicQuestionIds),
      getAllSurveyDemographicAnswers(surveyId),
    ]);

    // Build question results with statement text
    const questions = (surveyWithQuestions?.questions || []).map((statement, index) => ({
      index: index + 1,
      statementId: statement.statementId,
      statement: statement.statement,
    }));

    // Only count demographics from users who actually evaluated
    const questionStatementIds = questions.map((q) => q.statementId);

    const [evaluatorIds, solutionAdderIds, entrantIds] = await Promise.all([
      getEvaluatorUserIds(questionStatementIds),
      getSolutionAdderUserIds(questionStatementIds),
      getSurveyEntrantUserIds(surveyId),
    ]);

    // Total unique participants = union of survey-flow entrants + evaluators
    // + solution creators. Users who reach the question directly from the main
    // app have no SurveyProgress doc, so counting by SurveyProgress alone
    // underreports the true participant count.
    const allParticipantIds = new Set<string>([
      ...entrantIds,
      ...evaluatorIds,
      ...solutionAdderIds,
    ]);

    const evaluatorAnswers = demographicAnswers.filter((a) => {
      const uid = (a as UserDemographicQuestion & { userId?: string }).userId;

      return uid ? evaluatorIds.has(uid) : false;
    });

    // All respondents (everyone who answered the demographic form)
    const allRespondentsDemographics = aggregateDemographicAnswers(demographicQuestions, demographicAnswers);

    // Only evaluators (users who actually rated options)
    const evaluatorDemographics = aggregateDemographicAnswers(demographicQuestions, evaluatorAnswers);

    const participation: ParticipationStats = {
      totalEntered: allParticipantIds.size,
      totalEvaluators: evaluatorIds.size,
      totalSolutionAdders: solutionAdderIds.size,
    };

    return NextResponse.json({
      questions,
      demographics: allRespondentsDemographics,
      evaluatorDemographics,
      participation,
    });
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/results] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch survey results' },
      { status: 500 }
    );
  }
}
