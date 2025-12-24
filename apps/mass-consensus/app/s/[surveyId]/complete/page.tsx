import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSurveyWithQuestions } from '@/lib/firebase/surveys';
import SurveyComplete from '@/components/survey/SurveyComplete';
import { LanguageOverrideProvider } from '@/components/providers/LanguageOverrideProvider';

interface PageProps {
  params: { surveyId: string };
}

/**
 * Generate metadata for SEO
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const survey = await getSurveyWithQuestions(params.surveyId);

    if (!survey) {
      return {
        title: 'Survey Complete | Freedi',
      };
    }

    return {
      title: `${survey.title} - Complete | Freedi Survey`,
      description: `Thank you for completing the survey: ${survey.title}`,
    };
  } catch {
    return {
      title: 'Survey Complete | Freedi',
    };
  }
}

/**
 * Survey completion page - Shows summary and email signup
 */
export default async function SurveyCompletePage({ params }: PageProps) {
  try {
    console.info('[SurveyCompletePage] Loading survey:', params.surveyId);

    const survey = await getSurveyWithQuestions(params.surveyId);

    if (!survey) {
      console.error('[SurveyCompletePage] Survey not found:', params.surveyId);
      notFound();
    }

    console.info('[SurveyCompletePage] Survey loaded:', survey.title);

    return (
      <LanguageOverrideProvider
        adminLanguage={survey.defaultLanguage}
        forceLanguage={survey.forceLanguage}
      >
        <div className="page">
          <SurveyComplete survey={survey} />
        </div>
      </LanguageOverrideProvider>
    );
  } catch (error) {
    console.error('[SurveyCompletePage] Error loading page:', error);
    notFound();
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
