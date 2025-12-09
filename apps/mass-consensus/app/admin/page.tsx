import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Admin Dashboard | Freedi Surveys',
  description: 'Manage your surveys',
};

/**
 * Admin dashboard - Entry point for survey management
 */
export default function AdminDashboardPage() {
  return (
    <div className="page" style={{ padding: '2rem' }}>
      <h1>Survey Admin</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Create and manage linked question surveys
      </p>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Link
          href="/admin/surveys"
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem',
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            textDecoration: 'none',
            color: 'inherit',
            minWidth: '200px',
          }}
        >
          <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</span>
          <span style={{ fontWeight: 600, marginBottom: '0.25rem' }}>My Surveys</span>
          <span style={{ fontSize: '0.875rem', color: '#666' }}>View and manage surveys</span>
        </Link>

        <Link
          href="/admin/surveys/new"
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem',
            background: 'var(--btn-primary, #5f88e5)',
            borderRadius: '12px',
            textDecoration: 'none',
            color: 'white',
            minWidth: '200px',
          }}
        >
          <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>➕</span>
          <span style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Create Survey</span>
          <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>Link multiple questions</span>
        </Link>
      </div>

      <div style={{ marginTop: '3rem', padding: '1.5rem', background: '#f9fafb', borderRadius: '12px' }}>
        <h3 style={{ marginBottom: '1rem' }}>Quick Start Guide</h3>
        <ol style={{ paddingLeft: '1.5rem', lineHeight: 1.8 }}>
          <li>Create a new survey with a title and description</li>
          <li>Add existing questions or create new ones</li>
          <li>Reorder questions using drag-and-drop</li>
          <li>Share the survey link with participants</li>
          <li>View results as responses come in</li>
        </ol>
      </div>
    </div>
  );
}
