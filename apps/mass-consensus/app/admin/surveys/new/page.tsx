import { Metadata } from 'next';
import SurveyForm from '@/components/admin/SurveyForm';

export const metadata: Metadata = {
  title: 'Create Survey | Freedi Admin',
  description: 'Create a new linked question survey',
};

/**
 * Create new survey page
 */
export default function CreateSurveyPage() {
  return (
    <div className="page" style={{ padding: '2rem' }}>
      <SurveyForm />
    </div>
  );
}
