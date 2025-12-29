'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import { Survey, SurveyStatus } from '@/types/survey';
import styles from './Admin.module.scss';

interface SurveyStatusManagerProps {
  survey: Survey;
  onStatusChange: (updatedSurvey: Survey) => void;
}

interface SurveyStats {
  responseCount: number;
  completionCount: number;
  completionRate: number;
}

/**
 * Component for managing survey status (draft/active/closed)
 */
export default function SurveyStatusManager({ survey, onStatusChange }: SurveyStatusManagerProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { refreshToken } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, [survey.surveyId, refreshToken, router]);

  // Fetch stats on mount
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleStatusChange = async (newStatus: SurveyStatus) => {
    if (newStatus === SurveyStatus.closed && !showCloseConfirm) {
      setShowCloseConfirm(true);
      return;
    }

    setIsUpdating(true);
    setError(null);
    setShowCloseConfirm(false);

    try {
      const token = await refreshToken();
      if (!token) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }
      const response = await fetch(`/api/surveys/${survey.surveyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      const updatedSurvey = await response.json();
      onStatusChange(updatedSurvey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusDescription = (status: SurveyStatus) => {
    switch (status) {
      case SurveyStatus.draft:
        return t('draftDescription') || 'Survey is not visible to participants';
      case SurveyStatus.active:
        return t('activeDescription') || 'Survey is accepting responses';
      case SurveyStatus.closed:
        return t('closedDescription') || 'Survey is closed, no new responses';
      default:
        return '';
    }
  };

  const statusOptions: SurveyStatus[] = [SurveyStatus.draft, SurveyStatus.active, SurveyStatus.closed];

  return (
    <div className={styles.statusManager}>
      <h2>{t('surveyStatus')}</h2>

      {error && (
        <div className={styles.error}>
          <p>{error}</p>
        </div>
      )}

      {/* Stats Section */}
      {stats && (
        <div className={styles.statsSection}>
          <h3>{t('statistics')}</h3>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statNumber}>{stats.responseCount}</span>
              <span className={styles.statLabel}>{t('responses')}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statNumber}>{stats.completionCount}</span>
              <span className={styles.statLabel}>{t('completions')}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statNumber}>{stats.completionRate}%</span>
              <span className={styles.statLabel}>{t('completionRate')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Status Selection */}
      <div className={styles.statusSelection}>
        <h3>{t('changeStatus')}</h3>
        <div className={styles.statusOptions}>
          {statusOptions.map((status) => (
            <label
              key={status}
              className={`${styles.statusOption} ${survey.status === status ? styles.selected : ''}`}
            >
              <input
                type="radio"
                name="status"
                value={status}
                checked={survey.status === status}
                onChange={() => handleStatusChange(status)}
                disabled={isUpdating}
              />
              <div className={styles.statusOptionContent}>
                <span className={`${styles.statusBadge} ${styles[status]}`}>
                  {t(status)}
                </span>
                <span className={styles.statusDescription}>
                  {getStatusDescription(status)}
                </span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Close Confirmation Modal */}
      {showCloseConfirm && (
        <div className={styles.confirmModal}>
          <div className={styles.confirmContent}>
            <h3>{t('confirmClose')}</h3>
            <p>{t('closeWarning')}</p>
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelButton}
                onClick={() => setShowCloseConfirm(false)}
              >
                {t('cancel')}
              </button>
              <button
                className={styles.dangerButton}
                onClick={() => handleStatusChange(SurveyStatus.closed)}
                disabled={isUpdating}
              >
                {isUpdating ? t('closing') : t('closeSurvey')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
