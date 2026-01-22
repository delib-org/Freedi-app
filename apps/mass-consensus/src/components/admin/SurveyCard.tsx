'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import { Survey, SurveyStatus } from '@/types/survey';
import ExportModal from './ExportModal';
import styles from './Admin.module.scss';

interface SurveyCardProps {
  survey: Survey;
  onDelete: (surveyId: string) => void;
  onStatusChange?: (surveyId: string, newStatus: SurveyStatus) => void;
}

interface SurveyStats {
  responseCount: number;
  completionCount: number;
  completionRate: number;
}

/**
 * Enhanced survey card with stats display
 * Shows title, status, question count, response stats, and quick actions
 */
export default function SurveyCard({ survey, onDelete, onStatusChange }: SurveyCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { refreshToken } = useAuth();
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [isActivating, setIsActivating] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const token = await refreshToken();
      if (!token) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      const response = await fetch(`/api/surveys/${survey.surveyId}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, [survey.surveyId, refreshToken, router]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const getStatusBadgeClass = () => {
    switch (survey.status) {
      case SurveyStatus.active:
        return styles.statusActive;
      case SurveyStatus.closed:
        return styles.statusClosed;
      case SurveyStatus.draft:
      default:
        return styles.statusDraft;
    }
  };

  const handleDeleteClick = () => {
    if (confirm(t('confirmDeleteSurvey'))) {
      onDelete(survey.surveyId);
    }
  };

  const handleActivate = async () => {
    if (!onStatusChange) return;
    setIsActivating(true);
    try {
      await onStatusChange(survey.surveyId, SurveyStatus.active);
    } finally {
      setIsActivating(false);
    }
  };

  const handleExport = async (includeTestData: boolean) => {
    const token = await refreshToken();
    if (!token) {
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }

    const response = await fetch(
      `/api/surveys/${survey.surveyId}/export?includeTestData=${includeTestData}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      throw new Error('Export failed');
    }

    // Get the blob and trigger download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `survey-${survey.surveyId}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const isDraft = survey.status === SurveyStatus.draft;
  const isActive = survey.status === SurveyStatus.active;

  return (
    <div className={styles.enhancedCard}>
      {/* Header with title and status */}
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{survey.title}</h3>
        <span className={`${styles.statusBadge} ${getStatusBadgeClass()}`}>
          {t(survey.status || 'draft')}
        </span>
      </div>

      {/* Description */}
      {survey.description && (
        <p className={styles.cardDescription}>{survey.description}</p>
      )}

      {/* Meta info */}
      <div className={styles.cardMeta}>
        <span className={styles.metaItem}>
          {survey.questionIds.length} {t('questions')}
        </span>
      </div>

      {/* Stats section */}
      <div className={styles.cardStats}>
        {statsLoading ? (
          <div className={styles.statsLoading}>
            <div className={styles.miniSpinner} />
          </div>
        ) : stats ? (
          <>
            <div className={styles.statsRow}>
              <span className={styles.statValue}>{stats.responseCount}</span>
              <span className={styles.statLabel}>{t('responses')}</span>
              <span className={styles.statSeparator}>|</span>
              <span className={styles.statValue}>{stats.completionRate}%</span>
              <span className={styles.statLabel}>{t('completionRate')}</span>
            </div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${stats.completionRate}%` }}
              />
            </div>
          </>
        ) : (
          <div className={styles.noStats}>
            <span>-</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={styles.cardActions}>
        {isDraft && onStatusChange && (
          <button
            onClick={handleActivate}
            disabled={isActivating}
            className={`${styles.cardAction} ${styles.activateAction}`}
            style={{
              background: 'var(--agree)',
              color: 'white',
              border: 'none',
              cursor: isActivating ? 'not-allowed' : 'pointer',
            }}
          >
            {isActivating ? t('activating') || '...' : t('activate')}
          </button>
        )}
        <Link
          href={`/admin/surveys/${survey.surveyId}`}
          className={styles.cardAction}
        >
          {t('edit')}
        </Link>
        {isActive && (
          <Link
            href={`/s/${survey.surveyId}`}
            className={styles.cardAction}
            target="_blank"
          >
            {t('preview')}
          </Link>
        )}
        <button
          onClick={() => setShowExportModal(true)}
          className={`${styles.cardAction} ${styles.downloadAction}`}
        >
          {t('downloadData')}
        </button>
        <button
          onClick={handleDeleteClick}
          className={`${styles.cardAction} ${styles.deleteAction}`}
        >
          {t('delete')}
        </button>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <ExportModal
          surveyId={survey.surveyId}
          surveyTitle={survey.title}
          onClose={() => setShowExportModal(false)}
          onExport={handleExport}
        />
      )}
    </div>
  );
}
