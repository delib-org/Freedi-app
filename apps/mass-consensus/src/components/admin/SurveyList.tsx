'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Survey } from '@/types/survey';
import styles from './Admin.module.scss';

/**
 * List of surveys created by the admin
 */
export default function SurveyList() {
  const { t } = useTranslation();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSurveys();
  }, []);

  const fetchSurveys = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get auth token from localStorage or cookie
      const token = localStorage.getItem('firebase_token');

      if (!token) {
        setError('Please log in to view your surveys');
        setLoading(false);
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
  };

  const handleDelete = async (surveyId: string) => {
    if (!confirm(t('confirmDeleteSurvey'))) return;

    try {
      const token = localStorage.getItem('firebase_token');

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
            <div key={survey.surveyId} className={styles.surveyCard}>
              <div className={styles.surveyInfo}>
                <h3 className={styles.surveyTitle}>{survey.title}</h3>
                {survey.description && (
                  <p className={styles.surveyDescription}>{survey.description}</p>
                )}
                <div className={styles.surveyMeta}>
                  <span>
                    {survey.questionIds.length} {t('questions')}
                  </span>
                  <span>•</span>
                  <span className={survey.isActive ? styles.active : styles.inactive}>
                    {survey.isActive ? t('active') : t('inactive')}
                  </span>
                </div>
              </div>

              <div className={styles.surveyActions}>
                <Link
                  href={`/admin/surveys/${survey.surveyId}`}
                  className={styles.actionButton}
                >
                  {t('edit')}
                </Link>
                <Link
                  href={`/s/${survey.surveyId}`}
                  className={styles.actionButton}
                  target="_blank"
                >
                  {t('preview')}
                </Link>
                <button
                  onClick={() => handleDelete(survey.surveyId)}
                  className={`${styles.actionButton} ${styles.deleteButton}`}
                >
                  {t('delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
