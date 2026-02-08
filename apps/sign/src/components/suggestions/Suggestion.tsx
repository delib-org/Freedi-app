'use client';

import { memo, useMemo, useCallback } from 'react';
import { Suggestion as SuggestionType } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import { sanitizeHTML } from '@/lib/utils/sanitize';
import { markdownToHtml } from '@/lib/utils/htmlToMarkdown';
import { useOptimisticVote } from '@/hooks/useOptimisticVote';
import VotingBar from './VotingBar';
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

/**
 * Format timestamp to relative time string
 * Extracted outside component to prevent recreation on each render
 */
function formatDate(timestamp: number, t: (key: string) => string): string {
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
}

/**
 * Suggestion component with optimistic voting updates
 *
 * Performance optimizations:
 * - Memoized with React.memo
 * - VotingBar extracted to separate memoized component
 * - useOptimisticVote hook handles vote state locally
 * - Callbacks memoized with useCallback
 */
const Suggestion = memo(function Suggestion({
  suggestion,
  userId,
  userDisplayName,
  paragraphId,
  onDelete,
  onEdit,
  isCurrent = false,
}: SuggestionProps) {
  const { t } = useTranslation();

  // Debug: Log suggestion data
  console.info('[Suggestion] Rendering suggestion:', {
    id: suggestion.suggestionId,
    hasReasoning: !!suggestion.reasoning,
    reasoning: suggestion.reasoning,
    reasoningLength: suggestion.reasoning?.length || 0,
  });

  // Check if current user owns this suggestion
  const isOwner = Boolean(userId && suggestion.creatorId === userId);

  // Use optimistic vote hook for instant feedback
  const {
    userEvaluation,
    positiveCount,
    negativeCount,
    isConsensusLoading,
    isVoting,
    handleVote,
  } = useOptimisticVote({
    suggestionId: suggestion.suggestionId,
    paragraphId,
    userId,
    userDisplayName,
    initialPositiveCount: suggestion.positiveEvaluations || 0,
    initialNegativeCount: suggestion.negativeEvaluations || 0,
    isOwner,
  });

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

  // Memoize formatted date
  const formattedDate = useMemo(
    () => formatDate(suggestion.createdAt, t),
    [suggestion.createdAt, t]
  );

  // Memoize delete handler
  const handleDelete = useCallback(() => {
    if (window.confirm(t('Are you sure you want to delete this suggestion?'))) {
      onDelete(suggestion.suggestionId);
    }
  }, [onDelete, suggestion.suggestionId, t]);

  // Memoize edit handler
  const handleEdit = useCallback(() => {
    onEdit(suggestion);
  }, [onEdit, suggestion]);

  // Get display name for avatar
  const avatarLetter = suggestion.creatorDisplayName?.charAt(0).toUpperCase() || '?';
  const displayName = suggestion.creatorDisplayName || (isCurrent ? t('Official') : t('Anonymous'));

  return (
    <article
      className={`${styles.suggestion} ${isCurrent ? styles['suggestion--current'] : ''}`}
      aria-label={isCurrent ? t('Current official version') : undefined}
    >
      <header className={styles.header}>
        <div className={`${styles.avatar} ${isCurrent ? styles['avatar--current'] : ''}`}>
          {avatarLetter}
        </div>
        <div className={styles.meta}>
          <span className={styles.author}>{displayName}</span>
          <span className={styles.date}>{formattedDate}</span>
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
              onClick={handleEdit}
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
        <VotingBar
          userEvaluation={userEvaluation}
          positiveCount={positiveCount}
          negativeCount={negativeCount}
          consensus={suggestion.consensus || 0}
          isConsensusLoading={isConsensusLoading}
          isVoting={isVoting}
          userId={userId}
          onVote={handleVote}
        />
      )}

      {/* Show consensus for suggestion owners */}
      {isOwner && (suggestion.consensus || 0) !== 0 && (
        <div className={styles.consensusDisplay}>
          <span
            className={`${styles.voteScore} ${
              (suggestion.consensus || 0) > 0 ? styles.positive : styles.negative
            }`}
          >
            {(suggestion.consensus || 0) > 0 ? '+' : ''}
            {(suggestion.consensus || 0).toFixed(2)}
          </span>
        </div>
      )}
    </article>
  );
});

export default Suggestion;
