'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Survey, SurveyStatus } from '@/types/survey';
import SurveyForm from './SurveyForm';
import SurveyShare from './SurveyShare';
import SurveyStatusManager from './SurveyStatusManager';
import SurveyResults from './SurveyResults';

interface SurveyEditViewProps {
  survey: Survey;
}

type Tab = 'share' | 'status' | 'edit' | 'results';

/**
 * Survey edit view with tabs for sharing, status, and editing
 */
export default function SurveyEditView({ survey: initialSurvey }: SurveyEditViewProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('share');
  const [survey, setSurvey] = useState<Survey>(initialSurvey);

  const handleStatusChange = (updatedSurvey: Survey) => {
    setSurvey(updatedSurvey);
  };

  const getStatusBadgeStyle = (status: SurveyStatus) => {
    const baseStyle = {
      padding: '0.25rem 0.75rem',
      borderRadius: '12px',
      fontSize: '0.875rem',
      fontWeight: 600,
      marginLeft: '1rem',
    };

    switch (status) {
      case SurveyStatus.draft:
        return { ...baseStyle, background: 'var(--bg-muted)', color: 'var(--text-muted)' };
      case SurveyStatus.active:
        return { ...baseStyle, background: 'var(--agree)', color: 'white' };
      case SurveyStatus.closed:
        return { ...baseStyle, background: 'var(--disagree)', color: 'white' };
      default:
        return baseStyle;
    }
  };

  const tabButtonStyle = (isActive: boolean) => ({
    padding: '0.75rem 1.5rem',
    background: isActive ? 'var(--btn-primary)' : 'var(--bg-muted)',
    color: isActive ? 'white' : 'var(--text-body)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600,
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>{survey.title}</h1>
        <span style={getStatusBadgeStyle(survey.status)}>
          {t(survey.status)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('share')}
          style={tabButtonStyle(activeTab === 'share')}
        >
          {t('shareAndPreview')}
        </button>
        <button
          onClick={() => setActiveTab('status')}
          style={tabButtonStyle(activeTab === 'status')}
        >
          {t('status')}
        </button>
        <button
          onClick={() => setActiveTab('edit')}
          style={tabButtonStyle(activeTab === 'edit')}
        >
          {t('editSurvey')}
        </button>
        <button
          onClick={() => setActiveTab('results')}
          style={tabButtonStyle(activeTab === 'results')}
        >
          {t('results')}
        </button>
      </div>

      {activeTab === 'share' && <SurveyShare survey={survey} />}
      {activeTab === 'status' && (
        <SurveyStatusManager survey={survey} onStatusChange={handleStatusChange} />
      )}
      {activeTab === 'edit' && <SurveyForm existingSurvey={survey} onSurveyUpdate={setSurvey} />}
      {activeTab === 'results' && <SurveyResults survey={survey} />}
    </div>
  );
}
