'use client';

/**
 * CommentsList Component
 * Displays comments on a suggestion, fetched from the API.
 * Visible only to the suggestion creator or survey admin.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import styles from './CommentsList.module.css';

interface CommentsListProps {
  statementId: string;
}

interface CommentData {
  statementId: string;
  statement: string;
  reasoning?: string;
  createdAt: number;
  creator?: { displayName?: string; uid?: string };
}

const CommentsList: React.FC<CommentsListProps> = ({ statementId }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentData[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.uid;

  useEffect(() => {
    if (!isExpanded || hasLoaded || !userId) return;

    const fetchComments = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/comments/${statementId}?userId=${encodeURIComponent(userId)}`
        );

        if (response.status === 403) {
          setIsAuthorized(false);
          setHasLoaded(true);
          setIsLoading(false);

          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch comments');
        }

        const data = await response.json();
        setComments(data.comments || []);
        setHasLoaded(true);
      } catch {
        setError(t('Failed to load comments'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchComments();
  }, [isExpanded, hasLoaded, statementId, userId, t]);

  // Don't render anything if not logged in or not authorized
  if (!userId || (hasLoaded && !isAuthorized)) return null;

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={styles.commentsSection}>
      <button
        type="button"
        className={styles.toggleButton}
        onClick={handleToggle}
        aria-expanded={isExpanded}
      >
        <span>{t('View Comments')}</span>
        <span className={styles.chevron} data-expanded={isExpanded}>
          &#x25BC;
        </span>
      </button>

      {isExpanded && (
        <div className={styles.commentsList}>
          {isLoading && (
            <p className={styles.loadingText}>{t('Loading...')}</p>
          )}

          {error && <p className={styles.errorText}>{error}</p>}

          {hasLoaded && comments.length === 0 && !error && (
            <p className={styles.emptyText}>{t('No comments yet')}</p>
          )}

          {comments.map((comment) => (
            <div key={comment.statementId} className={styles.commentItem}>
              <p className={styles.commentText} dir="auto">
                {comment.reasoning || comment.statement}
              </p>
              <div className={styles.commentMeta}>
                <span className={styles.commentAuthor}>
                  {comment.creator?.displayName || t('Anonymous')}
                </span>
                <span className={styles.commentDate}>
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommentsList;
