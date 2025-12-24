import { Suspense } from 'react';
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSurveyWithQuestions } from '@/lib/firebase/surveys';
import { SurveyStatus } from '@/types/survey';
import { getAdaptiveBatch } from '@/lib/firebase/queries';
import QuestionHeader from '@/components/question/QuestionHeader';
import SolutionFeed from '@/components/question/SolutionFeed';
import SkeletonLoader from '@/components/shared/SkeletonLoader';
import { LanguageOverrideProvider } from '@/components/providers/LanguageOverrideProvider';
import SurveyQuestionWrapper from '@/components/survey/SurveyQuestionWrapper';
import { getParagraphsText } from '@/lib/utils/paragraphUtils';
import { getMergedSettings } from '@/lib/utils/settingsUtils';

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
      description: getParagraphsText(question.paragraphs) || `Question ${questionIndex + 1} of ${survey.questions.length}`,
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
    const questionId = question.statementId;

    // Get per-question settings override (if any)
    const questionOverrides = survey.questionSettings?.[questionId];

    // Merge survey settings with per-question overrides
    const mergedSettings = getMergedSettings(survey.settings, questionOverrides);

    // Fetch initial solutions using Thompson Sampling (no userId on SSR)
    const batchResult = await getAdaptiveBatch(question.statementId, undefined, { size: 6 });
    const initialBatch = batchResult.solutions;

    console.info('[SurveyQuestionPage] Loaded question:', question.statement?.substring(0, 30));
    console.info('[SurveyQuestionPage] Survey questionSettings:', JSON.stringify(survey.questionSettings));
    console.info('[SurveyQuestionPage] Question overrides for', questionId, ':', JSON.stringify(questionOverrides));
    console.info('[SurveyQuestionPage] Merged settings:', JSON.stringify(mergedSettings));

    return (
      <LanguageOverrideProvider
        adminLanguage={survey.defaultLanguage}
        forceLanguage={survey.forceLanguage}
      >
        <SurveyQuestionWrapper
          survey={survey}
          currentIndex={questionIndex}
          mergedSettings={mergedSettings}
        >
          {/* Question Header */}
          <QuestionHeader question={question} />

          {/* Solution Feed with Suspense */}
          <Suspense fallback={<SkeletonLoader count={3} />}>
            <SolutionFeed
              question={question}
              initialSolutions={initialBatch}
              mergedSettings={mergedSettings}
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
