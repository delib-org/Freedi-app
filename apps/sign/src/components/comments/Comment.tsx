'use client';

import { useState, useEffect, useCallback } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useUIStore, UIState } from '@/store/uiStore';
import styles from './Comment.module.scss';

interface CommentProps {
  comment: Statement;
  userId: string | null;
  paragraphId: string;
  onDelete: (commentId: string) => void;
  onUpdate: (commentId: string, newStatement: string) => void;
}

export default function Comment({ comment, userId, paragraphId, onDelete, onUpdate }: CommentProps) {
  const { t } = useTranslation();
  const addUserInteraction = useUIStore((state: UIState) => state.addUserInteraction);
  const [consensus, setConsensus] = useState(comment.consensus || 0);
  const [userEvaluation, setUserEvaluation] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.statement);
  const [isSaving, setIsSaving] = useState(false);

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
        // Mark paragraph as interacted
        addUserInteraction(paragraphId);
      }
    } catch (err) {
      console.error('Error submitting evaluation:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle edit save
  const handleSaveEdit = async () => {
    if (!editText.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/comments/${paragraphId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commentId: comment.statementId,
          statement: editText.trim(),
        }),
      });

      if (response.ok) {
        onUpdate(comment.statementId, editText.trim());
        setIsEditing(false);
      } else {
        const errorData = await response.json();
        console.error('Failed to update comment:', errorData.error);
      }
    } catch (err) {
      console.error('Error updating comment:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditText(comment.statement);
    setIsEditing(false);
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
        {isOwner && !isEditing && (
          <div className={styles.ownerActions}>
            <button
              type="button"
              className={styles.editButton}
              onClick={() => setIsEditing(true)}
              aria-label={t('Edit comment')}
              title={t('Edit')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.deleteButton}
              onClick={handleDelete}
              aria-label={t('Delete comment')}
              title={t('Delete')}
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
          </div>
        )}
      </header>

      {isEditing ? (
        <div className={styles.editForm}>
          <textarea
            className={styles.editTextarea}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            disabled={isSaving}
            autoFocus
          />
          <div className={styles.editActions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={handleCancelEdit}
              disabled={isSaving}
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              className={styles.saveButton}
              onClick={handleSaveEdit}
              disabled={isSaving || !editText.trim()}
            >
              {isSaving ? t('Saving...') : t('Save')}
            </button>
          </div>
        </div>
      ) : (
        <p className={styles.content}>{comment.statement}</p>
      )}

      {/* Evaluation section - only show if user is logged in and not the owner */}
      {userId && !isOwner && !isEditing && (
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
      {(!userId || isOwner) && consensus !== 0 && !isEditing && (
        <div className={styles.consensusDisplay}>
          <span className={`${styles.consensusScore} ${consensus > 0 ? styles.positive : styles.negative}`}>
            {consensus > 0 ? '+' : ''}{consensus}
          </span>
        </div>
      )}
    </article>
  );
}
