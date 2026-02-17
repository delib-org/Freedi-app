'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useUIStore, UIState } from '@/store/uiStore';
import { getVisitorId } from '@/lib/utils/visitor';
import { sanitizeHTML } from '@/lib/utils/sanitize';
import { markdownToHtml } from '@/lib/utils/htmlToMarkdown';
import { getPseudoName } from '@/lib/utils/pseudoName';
import { logError } from '@/lib/utils/errorHandling';
import styles from './Comment.module.scss';

interface CommentProps {
  comment: Statement;
  userId: string | null;
  paragraphId: string;
  onDelete: (commentId: string) => void;
  onUpdate: (commentId: string, newStatement: string) => void;
  /** When true, hide display names and show generic "Contributor" */
  hideUserIdentity?: boolean;
}

export default function Comment({ comment, userId, paragraphId, onDelete, onUpdate, hideUserIdentity = false }: CommentProps) {
  const { t } = useTranslation();
  const addUserInteraction = useUIStore((state: UIState) => state.addUserInteraction);

  // Use consensus from real-time parent data (comment prop updates via onSnapshot)
  const [consensus, setConsensus] = useState(comment.consensus || 0);
  const [userEvaluation, setUserEvaluation] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.statement);
  const [isSaving, setIsSaving] = useState(false);

  // Track if we have an in-flight evaluation update
  const [hasLocalUpdate, setHasLocalUpdate] = useState(false);

  // Sync consensus from real-time parent data when it changes
  // Only sync if we don't have a local update in progress
  useEffect(() => {
    if (!hasLocalUpdate) {
      setConsensus(comment.consensus || 0);
    }
  }, [comment.consensus, hasLocalUpdate]);

  // Sync edit text when comment is updated in real-time
  useEffect(() => {
    if (!isEditing) {
      setEditText(comment.statement);
    }
  }, [comment.statement, isEditing]);

  // Convert comment text: preserve newlines as paragraphs and support markdown
  const sanitizedContent = useMemo(() => {
    const content = comment.statement || '';
    const htmlContent = markdownToHtml(content);

    return sanitizeHTML(htmlContent);
  }, [comment.statement]);

  // Get effective ID - use userId if logged in, otherwise use visitorId for anonymous
  const visitorId = getVisitorId();
  const effectiveId = userId || visitorId;

  // Check if current user owns this comment
  const isOwner = effectiveId && comment.creatorId === effectiveId;

  // Fetch user's existing evaluation (one-time - user's own evaluation doesn't need real-time)
  const fetchEvaluation = useCallback(async () => {
    if (!effectiveId) return;

    try {
      // Pass visitorId as query param for anonymous users
      const url = userId
        ? `/api/evaluations/${comment.statementId}`
        : `/api/evaluations/${comment.statementId}?visitorId=${encodeURIComponent(visitorId)}`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setUserEvaluation(data.userEvaluation);
        // Don't override consensus here - real-time data from parent is more current
      }
    } catch (err) {
      logError(err, {
        operation: 'Comment.fetchEvaluation',
        metadata: { commentId: comment.statementId },
      });
    }
  }, [comment.statementId, effectiveId, userId, visitorId]);

  useEffect(() => {
    fetchEvaluation();
  }, [fetchEvaluation]);

  // Handle evaluation (approve/reject)
  const handleEvaluate = async (evaluation: number) => {
    if (!effectiveId || isOwner || isLoading) return;

    const previousConsensus = consensus;
    const previousEvaluation = userEvaluation;

    // If clicking the same evaluation, remove it
    if (userEvaluation === evaluation) {
      // Optimistic update
      setHasLocalUpdate(true);
      setIsLoading(true);
      setConsensus((prev) => prev - evaluation);
      setUserEvaluation(null);

      try {
        const url = userId
          ? `/api/evaluations/${comment.statementId}`
          : `/api/evaluations/${comment.statementId}?visitorId=${encodeURIComponent(visitorId)}`;

        const response = await fetch(url, {
          method: 'DELETE',
        });

        if (!response.ok) {
          // Rollback on failure
          setConsensus(previousConsensus);
          setUserEvaluation(previousEvaluation);
        }
      } catch (err) {
        // Rollback on error
        setConsensus(previousConsensus);
        setUserEvaluation(previousEvaluation);
        logError(err, {
          operation: 'Comment.handleEvaluate.remove',
          metadata: { commentId: comment.statementId },
        });
      } finally {
        setIsLoading(false);
        // Allow real-time sync after a short delay
        setTimeout(() => setHasLocalUpdate(false), 1500);
      }

      return;
    }

    // Optimistic update for new/changed evaluation
    setHasLocalUpdate(true);
    setIsLoading(true);

    // Calculate optimistic consensus change
    const oldEffect = previousEvaluation || 0;
    setConsensus((prev) => prev - oldEffect + evaluation);
    setUserEvaluation(evaluation);

    try {
      const response = await fetch(`/api/evaluations/${comment.statementId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          evaluation,
          ...(userId ? {} : { visitorId }),
        }),
      });

      if (response.ok) {
        // Mark paragraph as interacted
        addUserInteraction(paragraphId);
      } else {
        // Rollback on failure
        setConsensus(previousConsensus);
        setUserEvaluation(previousEvaluation);
      }
    } catch (err) {
      // Rollback on error
      setConsensus(previousConsensus);
      setUserEvaluation(previousEvaluation);
      logError(err, {
        operation: 'Comment.handleEvaluate.submit',
        metadata: { commentId: comment.statementId, evaluation },
      });
    } finally {
      setIsLoading(false);
      // Allow real-time sync after a short delay
      setTimeout(() => setHasLocalUpdate(false), 1500);
    }
  };

  // Handle edit save
  const handleSaveEdit = async () => {
    if (!editText.trim() || isSaving) return;

    setIsSaving(true);
    try {
      onUpdate(comment.statementId, editText.trim());
      setIsEditing(false);
    } catch (err) {
      logError(err, {
        operation: 'Comment.handleSaveEdit',
        metadata: { commentId: comment.statementId },
      });
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
          {hideUserIdentity
            ? getPseudoName(comment.creatorId).charAt(0).toUpperCase()
            : (comment.creator?.displayName?.charAt(0).toUpperCase() || '?')}
        </div>
        <div className={styles.meta}>
          <span className={styles.author}>
            {hideUserIdentity ? getPseudoName(comment.creatorId) : (comment.creator?.displayName || t('Anonymous'))}
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
        <div
          className={styles.content}
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          suppressHydrationWarning
        />
      )}

      {/* Evaluation section - show for all users (including anonymous) except owners */}
      {effectiveId && !isOwner && !isEditing && (
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

      {/* Show consensus for comment owners (they can't vote on their own comments) */}
      {isOwner && consensus !== 0 && !isEditing && (
        <div className={styles.consensusDisplay}>
          <span className={`${styles.consensusScore} ${consensus > 0 ? styles.positive : styles.negative}`}>
            {consensus > 0 ? '+' : ''}{consensus}
          </span>
        </div>
      )}
    </article>
  );
}
