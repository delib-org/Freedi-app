'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Survey, SurveyStatus } from '@/types/survey';
import SurveyForm from './SurveyForm';
import SurveyShare from './SurveyShare';
import SurveyStatusManager from './SurveyStatusManager';
import SurveyResults from './SurveyResults';
import SurveyAdminsPanel from './SurveyAdminsPanel';
import { useSurveyAdmins } from '@/hooks/useSurveyAdmins';

interface SurveyEditViewProps {
  survey: Survey;
}

type Tab = 'share' | 'status' | 'edit' | 'results' | 'admins';

/**
 * Survey edit view with tabs for sharing, status, and editing
 */
export default function SurveyEditView({ survey: initialSurvey }: SurveyEditViewProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('share');
  const [survey, setSurvey] = useState<Survey>(initialSurvey);
  // Resolves the caller's own access alongside the roster, so the tabs below
  // can hide what a view-only admin must not be offered.
  const roster = useSurveyAdmins(initialSurvey.surveyId);
  const canEdit = roster.access?.canEdit ?? false;
  // The edit form holds unsaved work. Unmounting it on a tab switch threw
  // that work away without a word — a setting you toggled and then went to
  // check somewhere else was silently back to its old value. So mount it
  // lazily on first visit and keep it mounted, hidden, from then on.
  const [hasOpenedEditor, setHasOpenedEditor] = useState(false);

  const selectTab = (tab: Tab) => {
    if (tab === 'edit') setHasOpenedEditor(true);
    setActiveTab(tab);
  };

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
          onClick={() => selectTab('share')}
          style={tabButtonStyle(activeTab === 'share')}
        >
          {t('shareAndPreview')}
        </button>
        {canEdit && (
          <button
            onClick={() => selectTab('status')}
            style={tabButtonStyle(activeTab === 'status')}
          >
            {t('status')}
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => selectTab('edit')}
            style={tabButtonStyle(activeTab === 'edit')}
          >
            {t('editSurvey')}
          </button>
        )}
        <button
          onClick={() => selectTab('results')}
          style={tabButtonStyle(activeTab === 'results')}
        >
          {t('results')}
        </button>
        <button
          onClick={() => selectTab('admins')}
          style={tabButtonStyle(activeTab === 'admins')}
        >
          {t('admins')}
        </button>
      </div>

      {activeTab === 'share' && <SurveyShare survey={survey} />}
      {canEdit && activeTab === 'status' && (
        <SurveyStatusManager survey={survey} onStatusChange={handleStatusChange} />
      )}
      {canEdit && hasOpenedEditor && (
        <div style={{ display: activeTab === 'edit' ? 'block' : 'none' }}>
          <SurveyForm existingSurvey={survey} onSurveyUpdate={setSurvey} />
        </div>
      )}
      {activeTab === 'results' && <SurveyResults survey={survey} />}
      {activeTab === 'admins' && (
        <SurveyAdminsPanel surveyId={survey.surveyId} roster={roster} />
      )}
    </div>
  );
}
