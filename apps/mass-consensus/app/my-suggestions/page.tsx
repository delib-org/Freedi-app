import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Statement } from '@freedi/shared-types';
import { getQuestionFromFirebase, getUserSolutions, getUserSuggestionsForSurvey, getCommentsForStatements } from '@/lib/firebase/queries';
import { getSurveyWithQuestions } from '@/lib/firebase/surveys';
import { getUserIdFromCookies } from '@/lib/utils/user';
import { LanguageOverrideProvider } from '@/components/providers/LanguageOverrideProvider';
import { MySuggestionsPageData, QuestionSuggestionsData, SuggestionWithComments, MySuggestionsStats } from '@/types/mySuggestions';
import MySuggestionsPage from '@/components/my-suggestions/MySuggestionsPage';
import { logger } from '@/lib/utils/logger';

interface PageProps {
  searchParams: Promise<{ surveyId?: string; questionId?: string }>;
}

export const metadata: Metadata = {
  title: 'My Suggestions | Freedi',
  description: 'View your suggestions and feedback from evaluators',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Build suggestion sections with comments for a list of questions and their solutions
 */
async function buildSections(
  questions: Statement[],
  suggestionsMap: Map<string, Statement[]>
): Promise<{ sections: QuestionSuggestionsData[]; stats: MySuggestionsStats }> {
  // Collect all suggestion IDs for batch comment fetching
  const allSuggestionIds: string[] = [];
  for (const solutions of suggestionsMap.values()) {
    for (const s of solutions) {
      allSuggestionIds.push(s.statementId);
    }
  }

  // Fetch comments for all suggestions in one batch
  const commentsMap = await getCommentsForStatements(allSuggestionIds, 2);

  let totalSuggestions = 0;
  let totalComments = 0;
  let scoreSum = 0;
  let scoredCount = 0;

  const sections: QuestionSuggestionsData[] = [];

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const solutions = suggestionsMap.get(question.statementId) || [];
    if (solutions.length === 0) continue;

    const suggestionsWithComments: SuggestionWithComments[] = solutions.map((suggestion) => {
      const commentData = commentsMap.get(suggestion.statementId) || { comments: [], total: 0 };
      totalSuggestions++;
      totalComments += commentData.total;

      const evaluators = suggestion.evaluation?.numberOfEvaluators ?? 0;
      if (evaluators > 0) {
        const sumPro = suggestion.evaluation?.sumPro ?? 0;
        const sumCon = suggestion.evaluation?.sumCon ?? 0;
        scoreSum += ((sumPro - sumCon) / evaluators) * 100;
        scoredCount++;
      }

      return {
        suggestion,
        comments: commentData.comments,
        totalComments: commentData.total,
      };
    });

    sections.push({
      question,
      questionIndex: i,
      suggestions: suggestionsWithComments,
    });
  }

  const stats: MySuggestionsStats = {
    totalSuggestions,
    totalComments,
    averageScore: scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0,
  };

  return { sections, stats };
}

export default async function MySuggestionsRoute({ searchParams }: PageProps) {
  const { surveyId, questionId } = await searchParams;

  if (!surveyId && !questionId) {
    redirect('/');
  }

  const cookieStore = await cookies();
  const userId = getUserIdFromCookies(cookieStore);
  if (!userId) {
    redirect('/');
  }

  try {
    let pageData: MySuggestionsPageData;

    if (surveyId) {
      // Survey mode: fetch survey, questions, then suggestions per question
      const survey = await getSurveyWithQuestions(surveyId);
      if (!survey) {
        logger.error('[MySuggestionsRoute] Survey not found:', surveyId);
        notFound();
      }

      const suggestionsMap = await getUserSuggestionsForSurvey(survey.questionIds, userId);
      const { sections, stats } = await buildSections(survey.questions, suggestionsMap);

      pageData = {
        mode: 'survey',
        surveyTitle: survey.title,
        surveyId: survey.surveyId,
        questionSections: sections,
        stats,
        adminLanguage: survey.defaultLanguage,
        forceLanguage: survey.forceLanguage ?? true,
      };
    } else {
      // Question mode: single question
      const question = await getQuestionFromFirebase(questionId!);
      const solutions = await getUserSolutions(questionId!, userId);

      const suggestionsMap = new Map<string, Statement[]>();
      if (solutions.length > 0) {
        suggestionsMap.set(question.statementId, solutions);
      }

      const { sections, stats } = await buildSections([question], suggestionsMap);

      pageData = {
        mode: 'question',
        questionSections: sections,
        stats,
        adminLanguage: question.defaultLanguage,
        forceLanguage: (question as { forceLanguage?: boolean }).forceLanguage ?? true,
      };
    }

    return (
      <LanguageOverrideProvider
        adminLanguage={pageData.adminLanguage}
        forceLanguage={pageData.forceLanguage}
      >
        <MySuggestionsPage data={pageData} />
      </LanguageOverrideProvider>
    );
  } catch (error) {
    logger.error('[MySuggestionsRoute] Error:', error);
    notFound();
  }
}
