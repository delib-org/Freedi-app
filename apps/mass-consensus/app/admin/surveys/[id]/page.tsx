import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSurveyById } from '@/lib/firebase/surveys';
import SurveyEditView from '@/components/admin/SurveyEditView';

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const survey = await getSurveyById(params.id);

  return {
    title: survey ? `Edit: ${survey.title} | Freedi Admin` : 'Survey Not Found',
  };
}

/**
 * Survey edit page
 */
export default async function EditSurveyPage({ params }: PageProps) {
  const survey = await getSurveyById(params.id);

  if (!survey) {
    notFound();
  }

  return (
    <div className="page" style={{ padding: '2rem' }}>
      <SurveyEditView survey={survey} />
    </div>
  );
}

export const dynamic = 'force-dynamic';
