'use client';

import { memo, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './Suggestion.module.scss';

interface VotingBarProps {
  userEvaluation: number | null;
  positiveCount: number;
  negativeCount: number;
  consensus: number;
  isConsensusLoading: boolean;
  isVoting: boolean;
  userId: string | null;
  onVote: (vote: number) => void;
}

/**
 * Memoized VotingBar component
 * Handles the display of vote buttons and consensus score
 * Optimized to prevent rerenders when parent component updates
 */
const VotingBar = memo(function VotingBar({
  userEvaluation,
  positiveCount,
  negativeCount,
  consensus,
  isConsensusLoading,
  isVoting,
  userId,
  onVote,
}: VotingBarProps) {
  const { t } = useTranslation();

  const handleUpvote = useCallback(() => {
    if (userId) {
      onVote(1);
    } else {
      alert(t('Please sign in to vote'));
    }
  }, [userId, onVote, t]);

  const handleDownvote = useCallback(() => {
    if (userId) {
      onVote(-1);
    } else {
      alert(t('Please sign in to vote'));
    }
  }, [userId, onVote, t]);

  const formattedConsensus = consensus.toFixed(2);
  const consensusSign = consensus > 0 ? '+' : '';

  return (
    <div className={styles.votingBar}>
      {/* Upvote Button */}
      <button
        type="button"
        className={`${styles.voteButton} ${styles.upvote} ${
          userEvaluation === 1 ? styles.active : ''
        } ${isVoting && userEvaluation !== 1 ? styles.voting : ''}`}
        onClick={handleUpvote}
        disabled={isVoting}
        aria-label={`${t('Vote up')}. ${positiveCount} ${t('votes in favor')}`}
        title={userId ? t('Vote up') : t('Sign in to vote')}
      >
        {positiveCount > 0 && (
          <span className={`${styles.voteCount} ${styles['voteCount--positive']}`}>
            {positiveCount}
          </span>
        )}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
        </svg>
      </button>

      {/* Consensus Score */}
      <span
        className={`${styles.voteScore} ${
          consensus > 0 ? styles.positive : consensus < 0 ? styles.negative : ''
        } ${isConsensusLoading ? styles.loading : ''}`}
      >
        {isConsensusLoading ? (
          <span className={styles.consensusLoader} aria-label={t('Calculating consensus')}>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </span>
        ) : (
          `${consensusSign}${formattedConsensus}`
        )}
      </span>

      {/* Downvote Button */}
      <button
        type="button"
        className={`${styles.voteButton} ${styles.downvote} ${
          userEvaluation === -1 ? styles.active : ''
        } ${isVoting && userEvaluation !== -1 ? styles.voting : ''}`}
        onClick={handleDownvote}
        disabled={isVoting}
        aria-label={`${t('Vote down')}. ${negativeCount} ${t('votes against')}`}
        title={userId ? t('Vote down') : t('Sign in to vote')}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
        </svg>
        {negativeCount > 0 && (
          <span className={`${styles.voteCount} ${styles['voteCount--negative']}`}>
            {negativeCount}
          </span>
        )}
      </button>
    </div>
  );
});

export default VotingBar;
