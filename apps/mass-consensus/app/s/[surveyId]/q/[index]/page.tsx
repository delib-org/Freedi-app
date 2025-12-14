import { Suspense } from 'react';
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSurveyWithQuestions } from '@/lib/firebase/surveys';
import { SurveyStatus } from '@/types/survey';
import { getRandomOptions } from '@/lib/firebase/queries';
import QuestionHeader from '@/components/question/QuestionHeader';
import SolutionFeed from '@/components/question/SolutionFeed';
import SkeletonLoader from '@/components/shared/SkeletonLoader';
import { LanguageOverrideProvider } from '@/components/providers/LanguageOverrideProvider';
import SurveyQuestionWrapper from '@/components/survey/SurveyQuestionWrapper';

interface PageProps {
  params: { surveyId: string; index: string };
}

/**
 * Generate metadata for SEO
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const survey = await getSurveyWithQuestions(params.surveyId);
    const questionIndex = parseInt(params.index, 10);

    if (!survey || questionIndex >= survey.questions.length) {
      return {
        title: 'Question Not Found | Freedi Survey',
      };
    }

    const question = survey.questions[questionIndex];

    return {
      title: `${question.statement} | ${survey.title}`,
      description: question.description || `Question ${questionIndex + 1} of ${survey.questions.length}`,
    };
  } catch {
    return {
      title: 'Question Not Found | Freedi Survey',
    };
  }
}

/**
 * Survey question page - Wraps existing question view with survey context
 */
export default async function SurveyQuestionPage({ params }: PageProps) {
  try {
    const questionIndex = parseInt(params.index, 10);

    if (isNaN(questionIndex) || questionIndex < 0) {
      redirect(`/s/${params.surveyId}`);
    }

    console.info('[SurveyQuestionPage] Loading survey:', params.surveyId, 'question:', questionIndex);

    const survey = await getSurveyWithQuestions(params.surveyId);

    if (!survey) {
      console.error('[SurveyQuestionPage] Survey not found:', params.surveyId);
      notFound();
    }

    // Check if survey is active (or handle legacy isActive field)
    const isActive = survey.status === SurveyStatus.active ||
      (survey.status === undefined && (survey as { isActive?: boolean }).isActive);

    if (!isActive) {
      redirect(`/s/${params.surveyId}`);
    }

    if (questionIndex >= survey.questions.length) {
      // If index is out of bounds, redirect to completion
      redirect(`/s/${params.surveyId}/complete`);
    }

    const question = survey.questions[questionIndex];

    // Fetch initial solutions for this question
    const initialBatch = await getRandomOptions(question.statementId, { size: 6 });

    console.info('[SurveyQuestionPage] Loaded question:', question.statement?.substring(0, 30));

    return (
      <LanguageOverrideProvider
        adminLanguage={question.defaultLanguage}
        forceLanguage={(question as { forceLanguage?: boolean }).forceLanguage}
      >
        <SurveyQuestionWrapper
          survey={survey}
          currentIndex={questionIndex}
        >
          {/* Question Header */}
          <QuestionHeader question={question} />

          {/* Solution Feed with Suspense */}
          <Suspense fallback={<SkeletonLoader count={3} />}>
            <SolutionFeed
              question={question}
              initialSolutions={initialBatch}
              surveySettings={survey.settings}
            />
          </Suspense>
        </SurveyQuestionWrapper>
      </LanguageOverrideProvider>
    );
  } catch (error) {
    console.error('[SurveyQuestionPage] Error loading page:', error);
    notFound();
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
