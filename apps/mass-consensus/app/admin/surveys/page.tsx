import { Metadata } from 'next';
import SurveyList from '@/components/admin/SurveyList';

export const metadata: Metadata = {
  title: 'My Surveys | Freedi Admin',
  description: 'Manage your linked question surveys',
};

/**
 * Admin surveys list page
 */
export default function AdminSurveysPage() {
  return (
    <div className="page" style={{ padding: '2rem' }}>
      <SurveyList />
    </div>
  );
}

export const dynamic = 'force-dynamic';
