'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import { Survey, SurveyStatus, TestDataCounts } from '@/types/survey';
import styles from './Admin.module.scss';

interface SurveyStatusManagerProps {
  survey: Survey;
  onStatusChange: (updatedSurvey: Survey) => void;
}

interface SurveyStats {
  responseCount: number;
  completionCount: number;
  completionRate: number;
  testResponseCount?: number;
  testCompletionCount?: number;
}

/**
 * Component for managing survey status (draft/active/closed) and test mode
 */
export default function SurveyStatusManager({ survey, onStatusChange }: SurveyStatusManagerProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { refreshToken } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showClearTestDataConfirm, setShowClearTestDataConfirm] = useState(false);
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [testDataCounts, setTestDataCounts] = useState<TestDataCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isClearingTestData, setIsClearingTestData] = useState(false);

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

  const fetchTestDataCounts = useCallback(async () => {
    try {
      const token = await refreshToken();
      if (!token) return;

      const response = await fetch(`/api/surveys/${survey.surveyId}/test-data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTestDataCounts(data);
      }
    } catch (err) {
      console.error('Failed to fetch test data counts:', err);
    }
  }, [survey.surveyId, refreshToken]);

  // Fetch stats and test data counts on mount
  useEffect(() => {
    fetchStats();
    fetchTestDataCounts();
  }, [fetchStats, fetchTestDataCounts]);

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

  const handleTestModeToggle = async () => {
    setIsUpdating(true);
    setError(null);

    try {
      const token = await refreshToken();
      if (!token) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));

        return;
      }

      const newTestMode = !survey.isTestMode;
      const response = await fetch(`/api/surveys/${survey.surveyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isTestMode: newTestMode }),
      });

      if (!response.ok) {
        throw new Error('Failed to update test mode');
      }

      const updatedSurvey = await response.json();
      onStatusChange(updatedSurvey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update test mode');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClearTestData = async () => {
    setIsClearingTestData(true);
    setError(null);

    try {
      const token = await refreshToken();
      if (!token) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));

        return;
      }

      const response = await fetch(`/api/surveys/${survey.surveyId}/test-data`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to clear test data');
      }

      // Refresh stats and test data counts
      await Promise.all([fetchStats(), fetchTestDataCounts()]);
      setShowClearTestDataConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear test data');
    } finally {
      setIsClearingTestData(false);
    }
  };

  return (
    <div className={styles.statusManager}>
      <h2>{t('surveyStatus')}</h2>

      {error && (
        <div className={styles.error}>
          <p>{error}</p>
        </div>
      )}

      {/* Test Mode Section */}
      <div className={styles.testModeSection}>
        <div className={styles.testModeHeader}>
          <h3>{t('testMode') || 'Test Mode'}</h3>
          {survey.isTestMode && (
            <span className={styles.testModeBadge}>{t('testModeActive') || 'Active'}</span>
          )}
        </div>
        <p className={styles.testModeDescription}>
          {t('testModeDescription') || 'When enabled, new responses are marked as test data and filtered from statistics.'}
        </p>
        <div className={styles.testModeToggle}>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={survey.isTestMode || false}
              onChange={handleTestModeToggle}
              disabled={isUpdating}
            />
            <span className={styles.toggleSlider}></span>
          </label>
          <span className={styles.toggleLabel}>
            {survey.isTestMode ? (t('disableTestMode') || 'Disable Test Mode') : (t('enableTestMode') || 'Enable Test Mode')}
          </span>
        </div>

        {/* Test Data Stats */}
        {(testDataCounts?.total ?? 0) > 0 && (
          <div className={styles.testDataStats}>
            <span className={styles.testDataCount}>
              {t('testResponses') || 'Test Responses'}: {testDataCounts?.progressCount || 0}
            </span>
            <button
              className={styles.clearTestDataButton}
              onClick={() => setShowClearTestDataConfirm(true)}
              disabled={isClearingTestData}
            >
              {t('clearTestData') || 'Clear Test Data'}
            </button>
          </div>
        )}

        {survey.isTestMode && (
          <div className={styles.testModeWarning}>
            {t('testModeWarning') || 'Responses collected now will be marked as test data.'}
          </div>
        )}
      </div>

      {/* Stats Section */}
      {stats && (
        <div className={styles.statsSection}>
          <h3>{t('statistics')}</h3>
          <p className={styles.statsNote}>
            {(stats.testResponseCount ?? 0) > 0
              ? `${t('liveResponses') || 'Live Responses'} (${t('excludingTestData') || 'excluding test data'})`
              : ''
            }
          </p>
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
          {(stats.testResponseCount ?? 0) > 0 && (
            <div className={styles.testStatsRow}>
              <span className={styles.testStatsLabel}>{t('testData') || 'Test Data'}:</span>
              <span>{stats.testResponseCount} {t('responses')}</span>
              <span>|</span>
              <span>{stats.testCompletionCount} {t('completions')}</span>
            </div>
          )}
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

      {/* Clear Test Data Confirmation Modal */}
      {showClearTestDataConfirm && (
        <div className={styles.confirmModal}>
          <div className={styles.confirmContent}>
            <h3>{t('clearTestData') || 'Clear Test Data'}</h3>
            <p>{t('clearTestDataConfirm') || 'Are you sure you want to delete all test data? This action cannot be undone.'}</p>
            <p className={styles.testDataPreview}>
              {testDataCounts?.progressCount || 0} {t('responses')} | {testDataCounts?.demographicAnswerCount || 0} {t('demographicAnswers') || 'demographic answers'}
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelButton}
                onClick={() => setShowClearTestDataConfirm(false)}
              >
                {t('cancel')}
              </button>
              <button
                className={styles.dangerButton}
                onClick={handleClearTestData}
                disabled={isClearingTestData}
              >
                {isClearingTestData ? (t('clearing') || 'Clearing...') : (t('clearTestData') || 'Clear Test Data')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
