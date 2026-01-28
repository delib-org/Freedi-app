'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Suggestion as SuggestionType } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useUIStore, UIState } from '@/store/uiStore';
import {
  setSuggestionEvaluation,
  removeSuggestionEvaluation,
  getUserEvaluation,
} from '@/controllers/db/evaluations/setSuggestionEvaluation';
import { sanitizeHTML } from '@/lib/utils/sanitize';
import { markdownToHtml } from '@/lib/utils/htmlToMarkdown';
import styles from './Suggestion.module.scss';

interface SuggestionProps {
  suggestion: SuggestionType;
  userId: string | null;
  userDisplayName: string | null;
  paragraphId: string;
  onDelete: (suggestionId: string) => void;
  onEdit: (suggestion: SuggestionType) => void;
  isCurrent?: boolean; // Mark as current official version
}

export default function Suggestion({
  suggestion,
  userId,
  userDisplayName,
  paragraphId,
  onDelete,
  onEdit,
  isCurrent = false,
}: SuggestionProps) {
  const { t } = useTranslation();
  const addUserInteraction = useUIStore((state: UIState) => state.addUserInteraction);
  const [userEvaluation, setUserEvaluation] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Sanitize HTML content to prevent XSS attacks
  // If content contains Markdown syntax, convert it to HTML first
  const sanitizedContent = useMemo(() => {
    const content = suggestion.suggestedContent || '';

    // Check if content looks like Markdown (contains ** or * or # or - at line start)
    const hasMarkdownSyntax = /\*\*|\*|^#{1,6}\s|^[-*+]\s/m.test(content);

    // If it's Markdown, convert to HTML first, then sanitize
    // If it's already HTML, just sanitize
    const htmlContent = hasMarkdownSyntax ? markdownToHtml(content) : content;

    return sanitizeHTML(htmlContent);
  }, [suggestion.suggestedContent]);

  // Check if current user owns this suggestion
  const isOwner = userId && suggestion.creatorId === userId;

  // Fetch user's existing evaluation from Firestore
  const fetchEvaluation = useCallback(async () => {
    if (!userId) return;

    try {
      const evaluation = await getUserEvaluation({
        suggestionId: suggestion.suggestionId,
        userId,
      });
      setUserEvaluation(evaluation);
    } catch (err) {
      console.error('Error fetching suggestion evaluation:', err);
    }
  }, [suggestion.suggestionId, userId]);

  useEffect(() => {
    fetchEvaluation();
  }, [fetchEvaluation]);

  // Handle evaluation (vote up/down) with direct Firestore write
  const handleVote = async (vote: number) => {
    // Prevent voting if:
    // - Not logged in
    // - User owns this suggestion
    // - Currently submitting
    if (!userId || isOwner || isLoading) {
      return;
    }

    setIsLoading(true);

    try {
      // Use 'Anonymous' as default display name for anonymous users
      const displayName = userDisplayName || 'Anonymous';

      // If clicking the same vote, remove it
      if (userEvaluation === vote) {
        await removeSuggestionEvaluation({
          suggestionId: suggestion.suggestionId,
          userId,
        });
        setUserEvaluation(null);
      } else {
        // Create or update evaluation
        await setSuggestionEvaluation({
          suggestionId: suggestion.suggestionId,
          userId,
          userDisplayName: displayName,
          evaluation: vote,
        });
        setUserEvaluation(vote);
        // Mark paragraph as interacted
        addUserInteraction(paragraphId);
      }

      // Note: Consensus will be updated automatically by Firebase Function and real-time listener
    } catch (err) {
      console.error('[handleVote] Error handling vote:', err);
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
    if (window.confirm(t('Are you sure you want to delete this suggestion?'))) {
      onDelete(suggestion.suggestionId);
    }
  };

  return (
    <article
      className={`${styles.suggestion} ${isCurrent ? styles['suggestion--current'] : ''}`}
      aria-label={isCurrent ? t('Current official version') : undefined}
    >
      <header className={styles.header}>
        <div className={`${styles.avatar} ${isCurrent ? styles['avatar--current'] : ''}`}>
          {suggestion.creatorDisplayName?.charAt(0).toUpperCase() || '?'}
        </div>
        <div className={styles.meta}>
          <span className={styles.author}>
            {suggestion.creatorDisplayName || (isCurrent ? t('Official') : t('Anonymous'))}
          </span>
          <span className={styles.date}>
            {formatDate(suggestion.createdAt)}
          </span>
        </div>
        {isCurrent && (
          <div className={styles.currentBadge}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
            {t('Current Version')}
          </div>
        )}
        {isOwner && !isCurrent && (
          <div className={styles.ownerActions}>
            <button
              type="button"
              className={styles.editButton}
              onClick={() => onEdit(suggestion)}
              aria-label={t('Edit suggestion')}
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
              aria-label={t('Delete suggestion')}
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

      <div className={styles.content}>
        <div
          className={styles.suggestedText}
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          suppressHydrationWarning
        />
        {suggestion.reasoning && (
          <div className={styles.reasoning}>
            <span className={styles.reasoningLabel}>{t('Reasoning')}:</span>
            <p>{suggestion.reasoning}</p>
          </div>
        )}
      </div>

      {/* Voting bar - show for all users except owner */}
      {!isOwner && (
        <div className={styles.votingBar}>
          <button
            type="button"
            className={`${styles.voteButton} ${styles.upvote} ${userEvaluation === 1 ? styles.active : ''}`}
            onClick={() => userId ? handleVote(1) : alert(t('Please sign in to vote'))}
            disabled={isLoading}
            aria-label={t('Vote up')}
            title={userId ? t('Vote up') : t('Sign in to vote')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
          </button>

          <span className={`${styles.voteScore} ${(suggestion.consensus || 0) > 0 ? styles.positive : (suggestion.consensus || 0) < 0 ? styles.negative : ''}`}>
            {(suggestion.consensus || 0) > 0 ? '+' : ''}{(suggestion.consensus || 0).toFixed(2)}
          </span>

          <button
            type="button"
            className={`${styles.voteButton} ${styles.downvote} ${userEvaluation === -1 ? styles.active : ''}`}
            onClick={() => userId ? handleVote(-1) : alert(t('Please sign in to vote'))}
            disabled={isLoading}
            aria-label={t('Vote down')}
            title={userId ? t('Vote down') : t('Sign in to vote')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
            </svg>
          </button>
        </div>
      )}

      {/* Show consensus for suggestion owners */}
      {isOwner && (suggestion.consensus || 0) !== 0 && (
        <div className={styles.consensusDisplay}>
          <span className={`${styles.voteScore} ${(suggestion.consensus || 0) > 0 ? styles.positive : styles.negative}`}>
            {(suggestion.consensus || 0) > 0 ? '+' : ''}{(suggestion.consensus || 0).toFixed(2)}
          </span>
        </div>
      )}
    </article>
  );
}
