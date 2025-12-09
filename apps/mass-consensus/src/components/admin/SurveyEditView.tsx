'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n';
import { Survey } from '@/types/survey';
import SurveyForm from './SurveyForm';
import SurveyShare from './SurveyShare';
import styles from './Admin.module.scss';

interface SurveyEditViewProps {
  survey: Survey;
}

type Tab = 'edit' | 'share';

/**
 * Survey edit view with tabs for editing and sharing
 */
export default function SurveyEditView({ survey }: SurveyEditViewProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('share');

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button
          onClick={() => setActiveTab('share')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'share' ? 'var(--btn-primary)' : 'var(--bg-muted)',
            color: activeTab === 'share' ? 'white' : 'var(--text-body)',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {t('shareAndPreview')}
        </button>
        <button
          onClick={() => setActiveTab('edit')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'edit' ? 'var(--btn-primary)' : 'var(--bg-muted)',
            color: activeTab === 'edit' ? 'white' : 'var(--text-body)',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {t('editSurvey')}
        </button>
      </div>

      {activeTab === 'share' ? (
        <SurveyShare survey={survey} />
      ) : (
        <SurveyForm existingSurvey={survey} />
      )}
    </div>
  );
}
