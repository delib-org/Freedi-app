import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getSurveyWithQuestions, getStatementIdForSurvey } from '@/lib/firebase/surveys';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections, StatementType, UserEvaluation } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface QuestionProgress {
  questionId: string;
  questionText: string;
  totalOptions: number;
  evaluatedCount: number;
}

interface DemographicProgress {
  pageId: string;
  pageTitle: string;
  isCompleted: boolean;
}

/**
 * GET /api/surveys/[id]/detailed-progress
 * Returns per-question evaluation counts and demographic completion status
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: surveyId } = await context.params;

  try {
    const url = new URL(request.url);
    const bodyUserId = url.searchParams.get('userId');
    const cookieUserId = getUserIdFromCookie(request.headers.get('cookie'));
    const userId = bodyUserId || cookieUserId;

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Client-reported completed question indices (from localStorage).
    // These represent questions the user navigated through in the MC flow,
    // which is the correct definition of "answered" for MC (users only
    // evaluate a random subset of options, never all of them).
    const completedIndicesParam = url.searchParams.get('completedIndices');
    const clientCompletedIndices: number[] = completedIndicesParam
      ? completedIndicesParam
          .split(',')
          .map((s) => Number.parseInt(s, 10))
          .filter((n) => Number.isInteger(n) && n >= 0)
      : [];

    const survey = await getSurveyWithQuestions(surveyId);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const db = getFirestoreAdmin();

    // Fetch UserEvaluation docs + live option counts for each question (batched)
    const questions: QuestionProgress[] = [];
    let totalOptionsEvaluated = 0;

    const evalPromises = survey.questions.map(async (question) => {
      const userEvaluationId = `${userId}--${question.statementId}`;

      // Run user-evaluation fetch + live option counts in parallel.
      // count() is a single aggregation read regardless of option count,
      // so this stays cheap even for questions with hundreds of options.
      // We compute visible = total - hidden instead of filtering by
      // hide==false, because legacy option docs may be missing the
      // hide field and would be excluded from an == query.
      const optionsBaseQuery = db
        .collection(Collections.statements)
        .where('parentId', '==', question.statementId)
        .where('statementType', '==', StatementType.option);

      const [evalDoc, totalOptionsSnap, hiddenOptionsSnap] = await Promise.all([
        db.collection(Collections.userEvaluations).doc(userEvaluationId).get(),
        optionsBaseQuery.count().get(),
        optionsBaseQuery.where('hide', '==', true).count().get(),
      ]);

      const totalOptions = Math.max(
        0,
        totalOptionsSnap.data().count - hiddenOptionsSnap.data().count
      );
      let evaluatedCount = 0;

      if (evalDoc.exists) {
        const data = evalDoc.data() as UserEvaluation;
        evaluatedCount = data.evaluatedOptionsIds?.length || 0;
      }

      return {
        questionId: question.statementId,
        questionText: question.statement,
        totalOptions,
        evaluatedCount,
      };
    });

    const questionResults = await Promise.all(evalPromises);
    for (const q of questionResults) {
      questions.push(q);
      totalOptionsEvaluated += q.evaluatedCount;
    }

    // Questions "answered" = questions the user navigated through in the
    // MC flow (from client localStorage). Fallback: any question where the
    // user has at least one evaluation, so the count is still reasonable
    // if the client didn't send completedIndices (e.g. old cached page).
    const questionsCompleted = clientCompletedIndices.length > 0
      ? clientCompletedIndices.filter((i) => i < survey.questions.length).length
      : questionResults.filter((q) => q.evaluatedCount > 0).length;

    // Check demographic completion
    // Answers are stored in usersData collection with ID: questionId--userId
    const demographics: DemographicProgress[] = [];
    let demographicsCompleted = 0;
    const demographicPages = survey.demographicPages || [];

    if (demographicPages.length > 0) {
      // Fetch all user's demographic answers for this survey in one query
      const statementId = getStatementIdForSurvey(survey);
      const answersSnapshot = await db
        .collection(Collections.usersData)
        .where('statementId', '==', statementId)
        .where('userId', '==', userId)
        .get();

      const answeredQuestionIds = new Set(
        answersSnapshot.docs.map(doc => doc.data().userQuestionId as string)
      );

      for (const page of demographicPages) {
        // A page is completed if the user has answered at least one question from it
        const hasAnswers = page.customQuestionIds.some(qId => answeredQuestionIds.has(qId));

        demographics.push({
          pageId: page.demographicPageId,
          pageTitle: page.title || 'About You',
          isCompleted: hasAnswers,
        });

        if (hasAnswers) demographicsCompleted++;
      }
    }

    return NextResponse.json({
      questions,
      demographics,
      overall: {
        questionsCompleted,
        totalQuestions: survey.questions.length,
        totalOptionsEvaluated,
        demographicsCompleted,
        totalDemographicPages: demographicPages.length,
      },
    });
  } catch (error) {
    logError(error, {
      operation: 'api.surveys.detailedProgress',
      metadata: { surveyId },
    });

    return NextResponse.json(
      { error: 'Failed to fetch detailed progress' },
      { status: 500 }
    );
  }
}
