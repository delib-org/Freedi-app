'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useUIStore } from '@/store/uiStore';
import { useDemographicStore, selectIsInteractionBlocked } from '@/store/demographicStore';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import { useHeatMapStore } from '@/store/heatMapStore';
import styles from './InteractionBar.module.scss';

interface DocumentApproval {
  approved: number;
  totalVoters: number;
  averageApproval: number;
}

interface InteractionBarProps {
  paragraphId: string;
  documentId: string;
  isApproved: boolean | undefined;
  isLoggedIn: boolean;
  commentCount: number;
  suggestionCount?: number;
  enableSuggestions?: boolean;
  /** When true, users must sign in with Google to interact */
  requireGoogleLogin?: boolean;
  /** Whether the current user is anonymous */
  isAnonymous?: boolean;
  /** Aggregate approval data from all voters (real-time via Firestore) */
  documentApproval?: DocumentApproval;
}

export default function InteractionBar({
  paragraphId,
  documentId,
  isApproved,
  isLoggedIn,
  commentCount,
  suggestionCount = 0,
  enableSuggestions = false,
  requireGoogleLogin = false,
  isAnonymous = false,
  documentApproval,
}: InteractionBarProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localApproval, setLocalApproval] = useState(isApproved);
  const { openModal, setApproval } = useUIStore();
  const { openSurveyModal } = useDemographicStore();
  const isInteractionBlocked = useDemographicStore(selectIsInteractionBlocked);

  // Sync local approval with store on mount and when isApproved changes
  useEffect(() => {
    if (isApproved !== undefined) {
      setApproval(paragraphId, isApproved);
    }
  }, [paragraphId, isApproved, setApproval]);

  // Whether interaction is blocked by requireGoogleLogin
  const isGoogleLoginRequired = requireGoogleLogin && isAnonymous;

  const handleApproval = useCallback(
    async (approved: boolean) => {
      // Check if Google login is required for interactions
      if (isGoogleLoginRequired) {
        openModal('login', {});

        return;
      }

      // Check if blocked by demographic survey
      if (isInteractionBlocked) {
        openSurveyModal();

        return;
      }

      // Ensure user has an ID (create anonymous user if needed)
      if (!isLoggedIn) {
        getOrCreateAnonymousUser();
      }

      // Optimistic update - both local state and store
      setLocalApproval(approved);
      setApproval(paragraphId, approved);
      setIsSubmitting(true);

      try {
        const response = await fetch(`/api/approvals/${paragraphId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            approval: approved,
            documentId,
          }),
        });

        if (!response.ok) {
          // Revert on failure
          setLocalApproval(isApproved);
          const error = await response.json();
          console.error('Failed to submit approval:', error);
        }
      } catch (error) {
        // Revert on error
        setLocalApproval(isApproved);
        console.error('Error submitting approval:', error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [paragraphId, documentId, isLoggedIn, isApproved, setApproval, isInteractionBlocked, openSurveyModal, isGoogleLoginRequired, openModal]
  );

  const handleOpenComments = () => {
    // Check if Google login is required for interactions
    if (isGoogleLoginRequired) {
      openModal('login', {});

      return;
    }

    // Check if blocked by demographic survey
    if (isInteractionBlocked) {
      openSurveyModal();

      return;
    }

    openModal('comments', { paragraphId });
  };

  const handleOpenSuggestions = () => {
    // Check if Google login is required for interactions
    if (isGoogleLoginRequired) {
      openModal('login', {});

      return;
    }

    // Check if blocked by demographic survey
    if (isInteractionBlocked) {
      openSurveyModal();

      return;
    }

    openModal('suggestions', { paragraphId });
  };

  // Tooltip text when blocked
  const blockedTitle = isGoogleLoginRequired
    ? t('Sign in with Google to interact')
    : isInteractionBlocked
      ? t('Complete survey to interact')
      : undefined;

  // Use local state if available, otherwise use prop
  const currentApproval = localApproval !== undefined ? localApproval : isApproved;

  // Stop propagation to prevent toggling the parent card
  const handleButtonClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  // Only show vote counts when approval heat map is active
  const heatMapConfig = useHeatMapStore((state) => state.config);
  const showVoteCounts = heatMapConfig.isEnabled && heatMapConfig.type === 'approval';
  const approveCount = documentApproval?.approved ?? 0;
  const rejectCount = documentApproval ? documentApproval.totalVoters - documentApproval.approved : 0;

  return (
    <div className={styles.bar} onClick={(e) => e.stopPropagation()}>
      <div className={styles.approvalButtons}>
        <button
          type="button"
          className={`${styles.button} ${styles.approveButton} ${currentApproval === true ? styles.active : ''} ${isInteractionBlocked || isGoogleLoginRequired ? styles.blocked : ''}`}
          onClick={(e) => handleButtonClick(e, () => handleApproval(true))}
          disabled={isSubmitting}
          aria-pressed={currentApproval === true}
          title={blockedTitle || t('Approve')}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className={styles.buttonText}>{t('Approve')}</span>
          {showVoteCounts && approveCount > 0 && (
            <span className={styles.voteCount}>{approveCount}</span>
          )}
        </button>

        <button
          type="button"
          className={`${styles.button} ${styles.rejectButton} ${currentApproval === false ? styles.active : ''} ${isInteractionBlocked || isGoogleLoginRequired ? styles.blocked : ''}`}
          onClick={(e) => handleButtonClick(e, () => handleApproval(false))}
          disabled={isSubmitting}
          aria-pressed={currentApproval === false}
          title={blockedTitle || t('Reject')}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          <span className={styles.buttonText}>{t('Reject')}</span>
          {showVoteCounts && rejectCount > 0 && (
            <span className={styles.voteCount}>{rejectCount}</span>
          )}
        </button>
      </div>

      <button
        type="button"
        className={`${styles.button} ${styles.commentButton} ${isInteractionBlocked || isGoogleLoginRequired ? styles.blocked : ''}`}
        onClick={(e) => handleButtonClick(e, handleOpenComments)}
        title={blockedTitle || t('Comments')}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className={styles.buttonText}>{t('Comments')}</span>
        {commentCount > 0 && (
          <span className={styles.commentCount}>{commentCount}</span>
        )}
      </button>

      {/* Suggest button - only show if suggestions are enabled */}
      {enableSuggestions && (
        <button
          type="button"
          className={`${styles.button} ${styles.suggestButton} ${isInteractionBlocked || isGoogleLoginRequired ? styles.blocked : ''}`}
          onClick={(e) => handleButtonClick(e, handleOpenSuggestions)}
          title={blockedTitle || t('Suggest Alternative')}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
          </svg>
          <span className={styles.buttonText}>{t('Suggest')}</span>
          {suggestionCount > 0 && (
            <span className={styles.suggestionCount}>{suggestionCount}</span>
          )}
        </button>
      )}
    </div>
  );
}
