import { Metadata } from 'next';
import { Suspense } from 'react';
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
      {/* SurveyForm reads search params (Studio pre-seeding) → needs a Suspense boundary */}
      <Suspense fallback={null}>
        <SurveyForm />
      </Suspense>
    </div>
  );
}
