'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import { Survey, SurveyStatus } from '@/types/survey';
import SurveyCard from './SurveyCard';
import styles from './Admin.module.scss';

/**
 * List of surveys created by the admin
 */
export default function SurveyList() {
  const { t } = useTranslation();
  const router = useRouter();
  const { refreshToken } = useAuth();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSurveys = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get fresh token (refreshes if expired)
      const token = await refreshToken();

      if (!token) {
        // Redirect to login if no valid token
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      const response = await fetch('/api/surveys', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch surveys');
      }

      const data = await response.json();
      setSurveys(data.surveys);
    } catch (err) {
      console.error('[SurveyList] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load surveys');
    } finally {
      setLoading(false);
    }
  }, [refreshToken, router]);

  useEffect(() => {
    fetchSurveys();
  }, [fetchSurveys]);

  const handleDelete = async (surveyId: string) => {
    if (!confirm(t('confirmDeleteSurvey'))) return;

    try {
      const token = await refreshToken();
      if (!token) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      const response = await fetch(`/api/surveys/${surveyId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete survey');
      }

      // Remove from list
      setSurveys((prev) => prev.filter((s) => s.surveyId !== surveyId));
    } catch (err) {
      console.error('[SurveyList] Delete error:', err);
      alert('Failed to delete survey');
    }
  };

  const handleStatusChange = async (surveyId: string, newStatus: SurveyStatus) => {
    try {
      const token = await refreshToken();
      if (!token) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      const response = await fetch(`/api/surveys/${surveyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update survey status');
      }

      const updatedSurvey = await response.json();

      // Update the survey in the list
      setSurveys((prev) =>
        prev.map((s) => (s.surveyId === surveyId ? { ...s, status: updatedSurvey.status } : s))
      );
    } catch (err) {
      console.error('[SurveyList] Status change error:', err);
      alert('Failed to update survey status');
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>{t('loadingSurveys')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>{error}</p>
        <button onClick={fetchSurveys} className={styles.retryButton}>
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.surveyList}>
      <div className={styles.listHeader}>
        <h1>{t('mySurveys')}</h1>
        <Link href="/admin/surveys/new" className={styles.createButton}>
          + {t('createSurvey')}
        </Link>
      </div>

      {surveys.length === 0 ? (
        <div className={styles.empty}>
          <p>{t('noSurveysYet')}</p>
          <Link href="/admin/surveys/new" className={styles.createButton}>
            {t('createFirstSurvey')}
          </Link>
        </div>
      ) : (
        <div className={styles.surveyGrid}>
          {surveys.map((survey) => (
            <SurveyCard
              key={survey.surveyId}
              survey={survey}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
