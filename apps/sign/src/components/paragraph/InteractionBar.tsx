'use client';

import { useState, useCallback } from 'react';
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
  const { openModal } = useUIStore();

  const handleApproval = useCallback(
    async (approved: boolean) => {
      if (!isLoggedIn) {
        window.location.href = `/login?redirect=/doc/${documentId}`;

        return;
      }

      // Optimistic update
      setLocalApproval(approved);
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
    [paragraphId, documentId, isLoggedIn, isApproved]
  );

  const handleOpenComments = () => {
    openModal('comments', { paragraphId });
  };

  // Use local state if available, otherwise use prop
  const currentApproval = localApproval !== undefined ? localApproval : isApproved;

  return (
    <div className={styles.bar}>
      <div className={styles.approvalButtons}>
        <button
          type="button"
          className={`${styles.button} ${styles.approveButton} ${currentApproval === true ? styles.active : ''}`}
          onClick={() => handleApproval(true)}
          disabled={isSubmitting}
          aria-pressed={currentApproval === true}
          title="Approve"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
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
          onClick={() => handleApproval(false)}
          disabled={isSubmitting}
          aria-pressed={currentApproval === false}
          title="Reject"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
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
        onClick={handleOpenComments}
        title="Comments"
      >
        <svg
          width="20"
          height="20"
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
