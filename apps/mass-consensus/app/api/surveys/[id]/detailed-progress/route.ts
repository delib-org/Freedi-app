import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getSurveyWithQuestions, getStatementIdForSurvey } from '@/lib/firebase/surveys';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections, UserEvaluation } from '@freedi/shared-types';
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

    const survey = await getSurveyWithQuestions(surveyId);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const db = getFirestoreAdmin();

    // Fetch UserEvaluation docs for each question (batched)
    const questions: QuestionProgress[] = [];
    let totalOptionsEvaluated = 0;
    let questionsCompleted = 0;

    const evalPromises = survey.questions.map(async (question) => {
      const userEvaluationId = `${userId}--${question.statementId}`;
      const evalDoc = await db
        .collection(Collections.userEvaluations)
        .doc(userEvaluationId)
        .get();

      const totalOptions = question.numberOfOptions || 0;
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
      if (q.totalOptions > 0 && q.evaluatedCount >= q.totalOptions) {
        questionsCompleted++;
      }
    }

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
