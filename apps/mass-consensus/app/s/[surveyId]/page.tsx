import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSurveyWithQuestions } from '@/lib/firebase/surveys';
import { SurveyStatus } from '@/types/survey';
import SurveyWelcome from '@/components/survey/SurveyWelcome';
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
        title: 'Survey Not Found | Freedi',
      };
    }

    return {
      title: `${survey.title} | Freedi Survey`,
      description: survey.description || `Participate in this survey: ${survey.title}`,
      openGraph: {
        title: survey.title,
        description: survey.description || 'Join the survey',
        type: 'website',
      },
    };
  } catch {
    return {
      title: 'Survey Not Found | Freedi',
    };
  }
}

/**
 * Survey entry page - Shows welcome screen
 */
export default async function SurveyPage({ params }: PageProps) {
  try {
    console.info('[SurveyPage] Loading survey:', params.surveyId);

    const survey = await getSurveyWithQuestions(params.surveyId);

    if (!survey) {
      console.error('[SurveyPage] Survey not found:', params.surveyId);
      notFound();
    }

    // Check if survey is active (or handle legacy isActive field)
    const isActive = survey.status === SurveyStatus.active ||
      (survey.status === undefined && (survey as { isActive?: boolean }).isActive);

    if (!isActive) {
      const isClosed = survey.status === SurveyStatus.closed;
      return (
        <div className="page">
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <h1>{isClosed ? 'Survey Closed' : 'Survey Not Available'}</h1>
            <p>{isClosed ? 'This survey is no longer accepting responses.' : 'This survey is currently not active.'}</p>
          </div>
        </div>
      );
    }

    if (survey.questionIds.length === 0) {
      return (
        <div className="page">
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <h1>{survey.title}</h1>
            <p>This survey has no questions yet.</p>
          </div>
        </div>
      );
    }

    console.info('[SurveyPage] Survey loaded:', survey.title, 'with', survey.questions.length, 'questions');

    return (
      <LanguageOverrideProvider
        adminLanguage={survey.defaultLanguage}
        forceLanguage={survey.forceLanguage ?? true}
      >
        <div className="page">
          <SurveyWelcome survey={survey} />
        </div>
      </LanguageOverrideProvider>
    );
  } catch (error) {
    console.error('[SurveyPage] Error loading survey:', error);
    notFound();
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
