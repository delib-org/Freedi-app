'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useUIStore } from '@/store/uiStore';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import { useCommentDraft } from '@/hooks/useCommentDraft';
import { useParagraphComments } from '@/hooks/useParagraphComments';
import { logError } from '@/lib/utils/errorHandling';
import Comment from './Comment';
import SuggestionPrompt from '../suggestions/SuggestionPrompt';
import styles from './CommentThread.module.scss';

interface CommentThreadProps {
  paragraphId: string;
  documentId: string;
  isLoggedIn: boolean;
  userId: string | null;
  onDraftChange?: (draft: string) => void;
  enableSuggestions?: boolean;
  originalContent?: string;
  onOpenSuggestions?: () => void;
  /** When true, hide display names in comments */
  hideUserIdentity?: boolean;
}

export default function CommentThread({
  paragraphId,
  documentId,
  isLoggedIn,
  userId,
  onDraftChange,
  enableSuggestions = false,
  originalContent: _originalContent = '',
  onOpenSuggestions,
  hideUserIdentity = false,
}: CommentThreadProps) {
  const { t } = useTranslation();
  const { incrementCommentCount, decrementCommentCount, addUserInteraction } = useUIStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { draft: newComment, setDraft: setNewComment, clearDraft } = useCommentDraft({ paragraphId });
  const [error, setError] = useState<string | null>(null);
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(userId);
  const [showSuggestionPrompt, setShowSuggestionPrompt] = useState(false);

  // Real-time comments from Firestore (updates instantly when anyone comments or evaluations change)
  const { comments, isLoading } = useParagraphComments(paragraphId);

  // Notify parent of draft changes for minimize feature
  useEffect(() => {
    onDraftChange?.(newComment);
  }, [newComment, onDraftChange]);

  // Ensure anonymous user is created if not logged in
  useEffect(() => {
    if (!isLoggedIn && !effectiveUserId) {
      const anonUserId = getOrCreateAnonymousUser();
      setEffectiveUserId(anonUserId);
    }
  }, [isLoggedIn, effectiveUserId]);

  // Check if the current user already has a comment
  const userComment = useMemo(() => {
    const currentUserId = effectiveUserId || userId;
    if (!currentUserId) return null;

    return comments.find((c) => c.creatorId === currentUserId) || null;
  }, [comments, userId, effectiveUserId]);

  // Submit new comment
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ensure we have a user ID (create anonymous if needed)
    if (!effectiveUserId && !userId) {
      const anonUserId = getOrCreateAnonymousUser();
      setEffectiveUserId(anonUserId);
    }

    if (!newComment.trim() || userComment) return;

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
        // Real-time listener will pick up the new comment automatically
        clearDraft();
        incrementCommentCount(paragraphId);
        addUserInteraction(paragraphId);
        if (enableSuggestions) {
          setShowSuggestionPrompt(true);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to post comment');
      }
    } catch (err) {
      logError(err, {
        operation: 'CommentThread.handleSubmit',
        userId: effectiveUserId || undefined,
        metadata: { paragraphId },
      });
      setError('Failed to post comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update comment via API (real-time listener will reflect the change)
  const handleUpdate = async (commentId: string, newStatement: string) => {
    try {
      const response = await fetch(`/api/comments/${paragraphId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commentId,
          statement: newStatement,
        }),
      });

      if (!response.ok) {
        logError(new Error('Failed to update comment'), {
          operation: 'CommentThread.handleUpdate',
          metadata: { paragraphId, commentId },
        });
      }
      // Real-time listener will update the comment automatically
    } catch (err) {
      logError(err, {
        operation: 'CommentThread.handleUpdate',
        metadata: { paragraphId, commentId },
      });
    }
  };

  // Delete comment via API (real-time listener will reflect the change)
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
        // Real-time listener will remove the comment automatically
        decrementCommentCount(paragraphId);
      } else {
        logError(new Error('Failed to delete comment'), {
          operation: 'CommentThread.handleDelete',
          metadata: { paragraphId, commentId },
        });
      }
    } catch (err) {
      logError(err, {
        operation: 'CommentThread.handleDelete',
        userId: effectiveUserId || undefined,
        metadata: { paragraphId, commentId },
      });
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
              userId={userId}
              paragraphId={paragraphId}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
              hideUserIdentity={hideUserIdentity}
            />
          ))
        )}
      </div>

      {/* New comment form - only show if user doesn't have a comment yet */}
      {userComment ? (
        <div className={styles.hasCommentNotice}>
          <p>{t('You have already commented on this paragraph. You can edit your comment above.')}</p>
        </div>
      ) : (
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
      )}

      {/* Post-comment suggestion prompt */}
      {showSuggestionPrompt && enableSuggestions && onOpenSuggestions && (
        <SuggestionPrompt
          paragraphId={paragraphId}
          onOpenSuggestions={onOpenSuggestions}
          onDismiss={() => setShowSuggestionPrompt(false)}
        />
      )}
    </div>
  );
}
