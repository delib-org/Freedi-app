'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Survey, SurveyStatus } from '@/types/survey';
import styles from './Admin.module.scss';

interface SurveyCardProps {
  survey: Survey;
  onDelete: (surveyId: string) => void;
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
export default function SurveyCard({ survey, onDelete }: SurveyCardProps) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [survey.surveyId]);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('firebase_token');
      if (!token) {
        setStatsLoading(false);
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
  };

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
        <Link
          href={`/admin/surveys/${survey.surveyId}`}
          className={styles.cardAction}
        >
          {t('edit')}
        </Link>
        <Link
          href={`/s/${survey.surveyId}`}
          className={styles.cardAction}
          target="_blank"
        >
          {t('preview')}
        </Link>
        <button
          onClick={handleDeleteClick}
          className={`${styles.cardAction} ${styles.deleteAction}`}
        >
          {t('delete')}
        </button>
      </div>
    </div>
  );
}
