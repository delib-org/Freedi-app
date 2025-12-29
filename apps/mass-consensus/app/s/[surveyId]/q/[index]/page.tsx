import { Suspense } from 'react';
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSurveyWithQuestions, getSurveyDemographicQuestions } from '@/lib/firebase/surveys';
import { SurveyStatus, buildSurveyFlow, isQuestionFlowItem, isDemographicFlowItem, isExplanationFlowItem, getTotalFlowLength } from '@/types/survey';
import { getAdaptiveBatch } from '@/lib/firebase/queries';
import QuestionHeader from '@/components/question/QuestionHeader';
import SolutionFeed from '@/components/question/SolutionFeed';
import SkeletonLoader from '@/components/shared/SkeletonLoader';
import { LanguageOverrideProvider } from '@/components/providers/LanguageOverrideProvider';
import SurveyQuestionWrapper from '@/components/survey/SurveyQuestionWrapper';
import SurveyDemographicPage from '@/components/survey/SurveyDemographicPage';
import SurveyExplanationPage from '@/components/survey/SurveyExplanationPage';
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
 * Now handles both questions and demographic pages based on the unified flow
 */
export default async function SurveyQuestionPage({ params }: PageProps) {
  try {
    const flowIndex = parseInt(params.index, 10);

    if (isNaN(flowIndex) || flowIndex < 0) {
      redirect(`/s/${params.surveyId}`);
    }

    console.info('[SurveyQuestionPage] Loading survey:', params.surveyId, 'flowIndex:', flowIndex);

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

    // Build the unified flow (questions + demographics + explanations)
    const flow = buildSurveyFlow(survey);
    const totalFlowItems = getTotalFlowLength(survey);

    console.info('[SurveyQuestionPage] Survey explanationPages:', survey.explanationPages?.length || 0);
    console.info('[SurveyQuestionPage] Survey demographicPages:', survey.demographicPages?.length || 0);
    console.info('[SurveyQuestionPage] Total flow items:', totalFlowItems, 'Flow length:', flow.length);
    console.info('[SurveyQuestionPage] Flow items:', flow.map(f => ({ type: f.type, id: f.id })));

    if (flowIndex >= totalFlowItems) {
      // If index is out of bounds, redirect to completion
      redirect(`/s/${params.surveyId}/complete`);
    }

    const flowItem = flow[flowIndex];

    if (!flowItem) {
      redirect(`/s/${params.surveyId}/complete`);
    }

    // Handle demographic page
    if (isDemographicFlowItem(flowItem)) {
      const demographicPage = flowItem.demographicPage;

      // Fetch the demographic questions for this page
      const demographicQuestions = await getSurveyDemographicQuestions(
        params.surveyId,
        demographicPage.customQuestionIds
      );

      return (
        <LanguageOverrideProvider
          adminLanguage={survey.defaultLanguage}
          forceLanguage={survey.forceLanguage ?? true}
        >
          <SurveyDemographicPage
            survey={survey}
            demographicPage={demographicPage}
            questions={demographicQuestions}
            currentFlowIndex={flowIndex}
          />
        </LanguageOverrideProvider>
      );
    }

    // Handle explanation page
    if (isExplanationFlowItem(flowItem)) {
      const explanationPage = flowItem.explanationPage;

      console.info('[SurveyQuestionPage] Rendering explanation page:', explanationPage.title);

      return (
        <LanguageOverrideProvider
          adminLanguage={survey.defaultLanguage}
          forceLanguage={survey.forceLanguage ?? true}
        >
          <SurveyExplanationPage
            survey={survey}
            explanationPage={explanationPage}
            currentFlowIndex={flowIndex}
          />
        </LanguageOverrideProvider>
      );
    }

    // Handle question page
    if (isQuestionFlowItem(flowItem)) {
      const questionIndex = flowItem.questionIndex;
      const question = survey.questions[questionIndex];

      if (!question) {
        redirect(`/s/${params.surveyId}/complete`);
      }

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
          forceLanguage={survey.forceLanguage ?? true}
        >
          <SurveyQuestionWrapper
            survey={survey}
            currentIndex={flowIndex}
            totalFlowItems={totalFlowItems}
            questionId={questionId}
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
    }

    // Fallback - should never reach here
    redirect(`/s/${params.surveyId}/complete`);
  } catch (error) {
    console.error('[SurveyQuestionPage] Error loading page:', error);
    notFound();
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
