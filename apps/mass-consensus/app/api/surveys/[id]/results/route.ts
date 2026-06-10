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
 * Single-pass extraction of both evaluator identity sets from the
 * `evaluations` collection. Replaces the two separate queries previously
 * issued by `getEvaluatorUserIds` (selecting `evaluator`) and
 * `getAllParticipantUserIds` (selecting `evaluatorId`) — Query Insights
 * showed both running at 35K executions/month against the same docs.
 *
 * - `explicitEvaluatorIds` (from `evaluator.uid`): users who explicitly
 *   rated a solution. Excludes the auto +1 MC writes when someone submits
 *   their own solution (which only sets `evaluatorId`, not `evaluator`).
 *   Those users are counted as solution adders, not evaluators.
 * - `allEvaluatorIds` (from `evaluatorId`): every user who has any
 *   evaluation row for the parent — including the auto +1 from
 *   submitting a solution. Used by the "all participants" tally.
 */
async function getEvaluationIdentitySets(
  parentStatementIds: string[],
): Promise<{ explicitEvaluatorIds: Set<string>; allEvaluatorIds: Set<string> }> {
  const db = getFirestoreAdmin();
  const explicitEvaluatorIds = new Set<string>();
  const allEvaluatorIds = new Set<string>();

  for (const parentId of parentStatementIds) {
    const snapshot = await db
      .collection(Collections.evaluations)
      .where('parentId', '==', parentId)
      .select('evaluator', 'evaluatorId')
      .get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      const explicitUid = data.evaluator?.uid;
      if (explicitUid) explicitEvaluatorIds.add(explicitUid);

      const anyUid = data.evaluatorId;
      if (anyUid) allEvaluatorIds.add(anyUid);
    });
  }

  return { explicitEvaluatorIds, allEvaluatorIds };
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
 * Distinct users who took any action on the survey: union of evaluation
 * authors (`evaluatorId`, including the MC auto +1 from submitting a
 * solution) and option creators. Both inputs are already collected by
 * `getEvaluationIdentitySets` and `getSolutionStats` — this is a pure
 * in-memory union, no extra Firestore reads.
 *
 * SurveyProgress docs are not used: they are only written when a user
 * clicks "Next", which misses anyone who evaluated or submitted without
 * navigating.
 */
function unionParticipantIds(
  allEvaluatorIds: Set<string>,
  optionCreatorIds: Set<string>,
): Set<string> {
  const ids = new Set<string>(allEvaluatorIds);
  for (const id of optionCreatorIds) ids.add(id);
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

    const [identitySets, solutionStats] = await Promise.all([
      getEvaluationIdentitySets(questionStatementIds),
      getSolutionStats(questionStatementIds),
    ]);
    const { explicitEvaluatorIds: evaluatorIds, allEvaluatorIds } = identitySets;
    const { adderIds: solutionAdderIds, totalSolutions } = solutionStats;
    const allParticipantIds = unionParticipantIds(allEvaluatorIds, solutionAdderIds);

    const evaluatorAnswers = demographicAnswers.filter((a) => {
      const uid = (a as UserDemographicQuestion & { userId?: string }).userId;

      return uid ? evaluatorIds.has(uid) : false;
    });

    // All respondents (everyone who answered the demographic form).
    // Exclude backfilled synthetic docs — they duplicate original pre-session-regen
    // entries (e.g. Rosh Pina Apr 15 orphans) and would inflate the "all
    // respondents" tally. They are still used for evaluator-linked demographics.
    const originalAnswers = demographicAnswers.filter(
      (a) => !(a as { backfilled?: boolean }).backfilled
    );
    const allRespondentsDemographics = aggregateDemographicAnswers(demographicQuestions, originalAnswers);

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
