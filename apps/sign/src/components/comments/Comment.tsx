'use client';

import { useState, useEffect, useCallback } from 'react';
import { Statement } from 'delib-npm';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './Comment.module.scss';

interface CommentProps {
  comment: Statement;
  userId: string | null;
  onDelete: (commentId: string) => void;
}

export default function Comment({ comment, userId, onDelete }: CommentProps) {
  const { t } = useTranslation();
  const [consensus, setConsensus] = useState(comment.consensus || 0);
  const [userEvaluation, setUserEvaluation] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check if current user owns this comment
  const isOwner = userId && comment.creatorId === userId;

  // Fetch user's existing evaluation
  const fetchEvaluation = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch(`/api/evaluations/${comment.statementId}`);
      if (response.ok) {
        const data = await response.json();
        setUserEvaluation(data.userEvaluation);
        setConsensus(data.sumEvaluation || 0);
      }
    } catch (err) {
      console.error('Error fetching evaluation:', err);
    }
  }, [comment.statementId, userId]);

  useEffect(() => {
    fetchEvaluation();
  }, [fetchEvaluation]);

  // Handle evaluation (approve/reject)
  const handleEvaluate = async (evaluation: number) => {
    if (!userId || isOwner || isLoading) return;

    // If clicking the same evaluation, remove it
    if (userEvaluation === evaluation) {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/evaluations/${comment.statementId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          setConsensus((prev) => prev - evaluation);
          setUserEvaluation(null);
        }
      } catch (err) {
        console.error('Error removing evaluation:', err);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/evaluations/${comment.statementId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ evaluation }),
      });

      if (response.ok) {
        const data = await response.json();
        setConsensus(data.newConsensus);
        setUserEvaluation(evaluation);
      }
    } catch (err) {
      console.error('Error submitting evaluation:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('Just now');
    if (diffMins < 60) return `${diffMins} ${t('minutes ago')}`;
    if (diffHours < 24) return `${diffHours} ${t('hours ago')}`;
    if (diffDays < 7) return `${diffDays} ${t('days ago')}`;

    return date.toLocaleDateString();
  };

  const handleDelete = () => {
    if (window.confirm(t('Are you sure you want to delete this comment?'))) {
      onDelete(comment.statementId);
    }
  };

  return (
    <article className={styles.comment}>
      <header className={styles.header}>
        <div className={styles.avatar}>
          {comment.creator?.displayName?.charAt(0).toUpperCase() || '?'}
        </div>
        <div className={styles.meta}>
          <span className={styles.author}>
            {comment.creator?.displayName || t('Anonymous')}
          </span>
          <span className={styles.date}>
            {formatDate(comment.createdAt)}
          </span>
        </div>
        {isOwner && (
          <button
            type="button"
            className={styles.deleteButton}
            onClick={handleDelete}
            aria-label={t('Delete comment')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
      </header>
      <p className={styles.content}>{comment.statement}</p>

      {/* Evaluation section - only show if user is logged in and not the owner */}
      {userId && !isOwner && (
        <div className={styles.evaluationBar}>
          <button
            type="button"
            className={`${styles.evalButton} ${styles.approve} ${userEvaluation === 1 ? styles.active : ''}`}
            onClick={() => handleEvaluate(1)}
            disabled={isLoading}
            aria-label={t('Approve')}
            title={t('Approve')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
          </button>

          <span className={`${styles.consensusScore} ${consensus > 0 ? styles.positive : consensus < 0 ? styles.negative : ''}`}>
            {consensus > 0 ? '+' : ''}{consensus}
          </span>

          <button
            type="button"
            className={`${styles.evalButton} ${styles.reject} ${userEvaluation === -1 ? styles.active : ''}`}
            onClick={() => handleEvaluate(-1)}
            disabled={isLoading}
            aria-label={t('Reject')}
            title={t('Reject')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
            </svg>
          </button>
        </div>
      )}

      {/* Show consensus for non-logged-in users or comment owners */}
      {(!userId || isOwner) && consensus !== 0 && (
        <div className={styles.consensusDisplay}>
          <span className={`${styles.consensusScore} ${consensus > 0 ? styles.positive : styles.negative}`}>
            {consensus > 0 ? '+' : ''}{consensus}
          </span>
        </div>
      )}
    </article>
  );
}
