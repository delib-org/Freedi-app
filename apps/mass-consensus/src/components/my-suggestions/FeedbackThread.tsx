'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { CommentData } from '@/types/api';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import styles from './FeedbackThread.module.scss';

interface FeedbackThreadProps {
  statementId: string;
  initialComments: CommentData[];
  totalComments: number;
}

function getRelativeTime(timestamp: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t('justNow');
  if (minutes < 60) return t('{{count}} min ago', { count: minutes });
  if (hours < 24) return t('{{count}} hours ago', { count: hours });

  return t('{{count}} days ago', { count: days });
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return parts[0][0]?.toUpperCase() || '?';
}

export default function FeedbackThread({ statementId, initialComments, totalComments }: FeedbackThreadProps) {
  const { t } = useTranslation();
  const [comments, setComments] = useState<CommentData[]>(initialComments);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const hasMore = totalComments > initialComments.length && !isExpanded;
  const remainingCount = totalComments - initialComments.length;

  const handleShowMore = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const userId = getOrCreateAnonymousUser();
      const response = await fetch(`/api/comments/${statementId}?userId=${encodeURIComponent(userId)}`);

      if (response.ok) {
        const data = await response.json();
        setComments(data.comments);
        setIsExpanded(true);
      }
    } catch (error) {
      console.error('[FeedbackThread] Error fetching comments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowLess = () => {
    setComments(initialComments);
    setIsExpanded(false);
  };

  if (totalComments === 0) {
    return (
      <div className={styles.feedbackThread}>
        <p className={styles.emptyFeedback}>{t('noFeedbackYet')}</p>
      </div>
    );
  }

  return (
    <div className={styles.feedbackThread}>
      <div className={styles.feedbackHeader}>
        <span className={styles.feedbackTitle}>{t('feedbackFromEvaluators')}</span>
        <span className={styles.countBadge}>{totalComments}</span>
      </div>

      <div className={styles.bubbleList}>
        {comments.map((comment) => (
          <div key={comment.statementId} className={styles.bubble}>
            <div className={styles.bubbleTop}>
              <div className={styles.avatar}>
                {getInitials(comment.creator?.displayName)}
              </div>
              <span className={styles.bubbleName}>
                {comment.creator?.displayName || t('anonymous')}
              </span>
              <span className={styles.bubbleDate}>
                {getRelativeTime(comment.createdAt, t)}
              </span>
            </div>
            <p className={styles.bubbleText} dir="auto">
              {comment.reasoning || comment.statement}
            </p>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          className={styles.showMoreButton}
          onClick={handleShowMore}
          disabled={isLoading}
        >
          {isLoading
            ? '...'
            : t('showMoreComments', { count: remainingCount })}
        </button>
      )}

      {isExpanded && totalComments > initialComments.length && (
        <button
          className={styles.showMoreButton}
          onClick={handleShowLess}
        >
          {t('showLess')}
        </button>
      )}
    </div>
  );
}
