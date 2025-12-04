'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Statement } from 'delib-npm';
import Comment from './Comment';
import styles from './CommentThread.module.scss';

interface CommentThreadProps {
  paragraphId: string;
  documentId: string;
  isLoggedIn: boolean;
}

export default function CommentThread({
  paragraphId,
  documentId,
  isLoggedIn,
}: CommentThreadProps) {
  const { t } = useTranslation();
  const [comments, setComments] = useState<Statement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/comments/${paragraphId}`);

      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || []);
      } else {
        console.error('Failed to fetch comments');
      }
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setIsLoading(false);
    }
  }, [paragraphId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Submit new comment
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newComment.trim() || !isLoggedIn) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/comments/${paragraphId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          statement: newComment.trim(),
          documentId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setComments((prev) => [...prev, data.comment]);
        setNewComment('');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to post comment');
      }
    } catch (err) {
      console.error('Error posting comment:', err);
      setError('Failed to post comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete comment
  const handleDelete = async (commentId: string) => {
    try {
      const response = await fetch(`/api/comments/${paragraphId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ commentId }),
      });

      if (response.ok) {
        setComments((prev) => prev.filter((c) => c.statementId !== commentId));
      } else {
        console.error('Failed to delete comment');
      }
    } catch (err) {
      console.error('Error deleting comment:', err);
    }
  };

  return (
    <div className={styles.container}>
      {/* Comments list */}
      <div className={styles.list}>
        {isLoading ? (
          <div className={styles.loading}>
            <div className="skeleton" style={{ height: '60px', marginBottom: '8px' }} />
            <div className="skeleton" style={{ height: '60px', marginBottom: '8px' }} />
          </div>
        ) : comments.length === 0 ? (
          <p className={styles.empty}>{t('No comments yet')}</p>
        ) : (
          comments.map((comment) => (
            <Comment
              key={comment.statementId}
              comment={comment}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* New comment form */}
      {isLoggedIn ? (
        <form className={styles.form} onSubmit={handleSubmit}>
          <textarea
            className={styles.textarea}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t('Add a comment...')}
            rows={3}
            disabled={isSubmitting}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isSubmitting || !newComment.trim()}
          >
            {isSubmitting ? t('Posting...') : t('Post Comment')}
          </button>
        </form>
      ) : (
        <p className={styles.loginPrompt}>
          {t('Please log in to add comments')}
        </p>
      )}
    </div>
  );
}
