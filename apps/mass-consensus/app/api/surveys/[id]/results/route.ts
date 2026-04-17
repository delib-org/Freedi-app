import { NextRequest, NextResponse } from 'next/server';
import {
  getSurveyById,
  getSurveyWithQuestions,
  getSurveyDemographicQuestions,
  getAllSurveyDemographicAnswers,
} from '@/lib/firebase/surveys';
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
  totalSolutions: number;
  totalNotEngaged: number;
}

/**
 * Distinct users who explicitly rated at least one solution. Reads
 * `evaluator.uid` so the auto +1 that MC writes when someone submits their
 * own solution (which only sets `evaluatorId`) is excluded — those people
 * are counted as solution adders, not evaluators.
 */
async function getEvaluatorUserIds(parentStatementIds: string[]): Promise<Set<string>> {
  const db = getFirestoreAdmin();
  const evaluatorIds = new Set<string>();

  for (const parentId of parentStatementIds) {
    const snapshot = await db
      .collection(Collections.evaluations)
      .where('parentId', '==', parentId)
      .select('evaluator')
      .get();

    snapshot.forEach((doc) => {
      const uid = doc.data().evaluator?.uid;
      if (uid) evaluatorIds.add(uid);
    });
  }

  return evaluatorIds;
}

/**
 * Walk all option statements under the given parents and return both the set
 * of distinct creator IDs (for "solution adders") and the total option count
 * (for "solutions submitted"). Collected in one scan to avoid a second query.
 */
async function getSolutionStats(
  parentStatementIds: string[]
): Promise<{ adderIds: Set<string>; totalSolutions: number }> {
  const db = getFirestoreAdmin();
  const adderIds = new Set<string>();
  let totalSolutions = 0;

  for (const parentId of parentStatementIds) {
    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', parentId)
      .where('statementType', '==', StatementType.option)
      .select('creatorId')
      .get();

    totalSolutions += snapshot.size;
    snapshot.forEach((doc) => {
      const creatorId = doc.data().creatorId;
      if (creatorId) {
        adderIds.add(creatorId);
      }
    });
  }

  return { adderIds, totalSolutions };
}

/**
 * Distinct users who took any action on the survey — any evaluation (even the
 * auto +1 from submitting a solution) or any option. Uses `evaluatorId` on the
 * evaluation doc (set on every evaluation, including MC auto +1s) unioned with
 * option creators. This is the "entered" count.
 *
 * SurveyProgress docs are not used: they are only written when a user clicks
 * "Next", which misses anyone who evaluated or submitted without navigating.
 */
async function getAllParticipantUserIds(parentStatementIds: string[]): Promise<Set<string>> {
  const db = getFirestoreAdmin();
  const ids = new Set<string>();

  for (const parentId of parentStatementIds) {
    const evalSnap = await db
      .collection(Collections.evaluations)
      .where('parentId', '==', parentId)
      .select('evaluatorId')
      .get();

    evalSnap.forEach((doc) => {
      const id = doc.data().evaluatorId;
      if (id) ids.add(id);
    });

    const optSnap = await db
      .collection(Collections.statements)
      .where('parentId', '==', parentId)
      .where('statementType', '==', StatementType.option)
      .select('creatorId')
      .get();

    optSnap.forEach((doc) => {
      const id = doc.data().creatorId;
      if (id) ids.add(id);
    });
  }

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

    const [evaluatorIds, solutionStats, allParticipantIds] = await Promise.all([
      getEvaluatorUserIds(questionStatementIds),
      getSolutionStats(questionStatementIds),
      getAllParticipantUserIds(questionStatementIds),
    ]);
    const { adderIds: solutionAdderIds, totalSolutions } = solutionStats;

    const evaluatorAnswers = demographicAnswers.filter((a) => {
      const uid = (a as UserDemographicQuestion & { userId?: string }).userId;

      return uid ? evaluatorIds.has(uid) : false;
    });

    // All respondents (everyone who answered the demographic form)
    const allRespondentsDemographics = aggregateDemographicAnswers(demographicQuestions, demographicAnswers);

    // Only evaluators (users who actually rated options)
    const evaluatorDemographics = aggregateDemographicAnswers(demographicQuestions, evaluatorAnswers);

    // Fold demographic answerers into the Entered count — users who answered
    // the demographic form but dropped off before evaluating or submitting
    // still entered the survey and should be counted.
    const enteredIds = new Set<string>(allParticipantIds);
    for (const answer of demographicAnswers) {
      const uid = (answer as UserDemographicQuestion & { userId?: string }).userId;
      if (uid) enteredIds.add(uid);
    }

    // "Engaged" = took any action on the question (evaluated, auto +1 from
    // submitting a solution, or added a solution). allParticipantIds already
    // represents that set. "Not engaged" = entered the survey (answered
    // demographics) but never touched the question.
    const notEngagedCount = Math.max(
      0,
      enteredIds.size - allParticipantIds.size
    );

    const participation: ParticipationStats = {
      totalEntered: enteredIds.size,
      totalEvaluators: evaluatorIds.size,
      totalSolutionAdders: solutionAdderIds.size,
      totalSolutions,
      totalNotEngaged: notEngagedCount,
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
