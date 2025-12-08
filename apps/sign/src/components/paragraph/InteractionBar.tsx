'use client';

import { useState, useCallback, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import styles from './InteractionBar.module.scss';

interface InteractionBarProps {
  paragraphId: string;
  documentId: string;
  isApproved: boolean | undefined;
  isLoggedIn: boolean;
  commentCount: number;
}

export default function InteractionBar({
  paragraphId,
  documentId,
  isApproved,
  isLoggedIn,
  commentCount,
}: InteractionBarProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localApproval, setLocalApproval] = useState(isApproved);
  const { openModal, setApproval } = useUIStore();

  // Sync local approval with store on mount and when isApproved changes
  useEffect(() => {
    if (isApproved !== undefined) {
      setApproval(paragraphId, isApproved);
    }
  }, [paragraphId, isApproved, setApproval]);

  const handleApproval = useCallback(
    async (approved: boolean) => {
      if (!isLoggedIn) {
        window.location.href = `/login?redirect=/doc/${documentId}`;

        return;
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
    [paragraphId, documentId, isLoggedIn, isApproved, setApproval]
  );

  const handleOpenComments = () => {
    openModal('comments', { paragraphId });
  };

  // Use local state if available, otherwise use prop
  const currentApproval = localApproval !== undefined ? localApproval : isApproved;

  // Stop propagation to prevent toggling the parent card
  const handleButtonClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <div className={styles.bar} onClick={(e) => e.stopPropagation()}>
      <div className={styles.approvalButtons}>
        <button
          type="button"
          className={`${styles.button} ${styles.approveButton} ${currentApproval === true ? styles.active : ''}`}
          onClick={(e) => handleButtonClick(e, () => handleApproval(true))}
          disabled={isSubmitting}
          aria-pressed={currentApproval === true}
          title="Approve"
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
          <span className={styles.buttonText}>Approve</span>
        </button>

        <button
          type="button"
          className={`${styles.button} ${styles.rejectButton} ${currentApproval === false ? styles.active : ''}`}
          onClick={(e) => handleButtonClick(e, () => handleApproval(false))}
          disabled={isSubmitting}
          aria-pressed={currentApproval === false}
          title="Reject"
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
          <span className={styles.buttonText}>Reject</span>
        </button>
      </div>

      <button
        type="button"
        className={`${styles.button} ${styles.commentButton}`}
        onClick={(e) => handleButtonClick(e, handleOpenComments)}
        title="Comments"
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
        {commentCount > 0 && (
          <span className={styles.commentCount}>{commentCount}</span>
        )}
      </button>
    </div>
  );
}
