'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import Modal from '../shared/Modal';
import { logger } from '@/lib/utils/logger';
import styles from './RejectionFeedbackModal.module.scss';

interface SatisfactionFeedbackModalProps {
  documentId: string;
  userId: string | null;
  /** The rating just submitted (-1..1); phrases the ask positively for satisfied users */
  score?: number;
  onClose: () => void;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Shown after a user rates a document in satisfaction footer mode. Asks
 * satisfied users what worked well and unsatisfied users what fell short,
 * saving the explanation through the existing comments mechanism (a comment
 * attached directly to the document), so the user's name is preserved and
 * the feedback is visible to admins.
 */
export default function SatisfactionFeedbackModal({
  documentId,
  userId,
  score = 0,
  onClose,
}: SatisfactionFeedbackModalProps) {
  const { t } = useTranslation();
  const isPositive = score >= 1;
  const [reason, setReason] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when modal opens
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleSkip = () => {
    onClose();
    window.location.reload();
  };

  /**
   * The comments API allows one comment per user per parent. If the user
   * already left document-level feedback (e.g. rated again), update the
   * existing comment instead.
   */
  const updateExistingComment = async (text: string): Promise<boolean> => {
    try {
      const listResponse = await fetch(`/api/comments/${documentId}`);
      if (!listResponse.ok) return false;

      const { comments } = await listResponse.json();
      const ownComment = Array.isArray(comments)
        ? comments.find((c: { creatorId?: string }) => c.creatorId === userId)
        : null;

      if (!ownComment?.statementId) return false;

      const updateResponse = await fetch(`/api/comments/${documentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ commentId: ownComment.statementId, statement: text }),
      });

      return updateResponse.ok;
    } catch (error) {
      logger.error('[SatisfactionFeedbackModal] Failed to update existing feedback:', {
        error,
        documentId,
      });

      return false;
    }
  };

  const handleSubmit = async () => {
    const text = reason.trim();

    if (!text) {
      handleSkip();

      return;
    }

    setSubmitState('submitting');
    setErrorMessage('');

    try {
      // Reuse the existing comments mechanism: a comment parented to the
      // document itself (preserves the user's display name for the admin).
      const response = await fetch(`/api/comments/${documentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ statement: text, documentId }),
      });

      let ok = response.ok;

      // 409 = user already has document-level feedback; update it instead
      if (!ok && response.status === 409) {
        ok = await updateExistingComment(text);
      }

      if (ok) {
        setSubmitState('success');
        // Wait for thank you animation before closing
        setTimeout(() => {
          onClose();
          window.location.reload();
        }, 800);
      } else {
        setSubmitState('error');
        setErrorMessage(t('satisfactionFeedbackError') || 'Could not send feedback. You can try again or skip.');
      }
    } catch {
      setSubmitState('error');
      setErrorMessage(t('satisfactionFeedbackError') || 'Could not send feedback. You can try again or skip.');
    }
  };

  return (
    <Modal
      title={isPositive
        ? (t('satisfactionPositiveFeedbackTitle') || 'Glad you liked it!')
        : (t('satisfactionFeedbackTitle') || 'Help us improve')}
      onClose={handleSkip}
      size="small"
    >
      <div className={styles.feedbackContent}>
        <p className={styles.description}>
          {isPositive
            ? (t('satisfactionPositiveFeedbackBody') || 'Can you share what you liked about this document? Knowing what worked well helps us keep it that way.')
            : (t('satisfactionFeedbackBody') || 'Can you share why you are not fully satisfied with this document? Your feedback helps us improve it.')}
        </p>

        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder={t('satisfactionFeedbackPlaceholder') || 'Share your thoughts... (optional)'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label={t('satisfactionFeedbackPlaceholder') || 'Satisfaction feedback (optional)'}
          disabled={submitState === 'submitting' || submitState === 'success'}
        />

        {submitState === 'error' && errorMessage && (
          <p className={styles.errorMessage}>{errorMessage}</p>
        )}

        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.skipButton}
            onClick={handleSkip}
            disabled={submitState === 'submitting' || submitState === 'success'}
          >
            {t('rejectionFeedbackSkip') || 'Skip'}
          </button>

          <button
            type="button"
            className={styles.submitButton}
            onClick={handleSubmit}
            disabled={submitState === 'submitting' || submitState === 'success'}
          >
            {submitState === 'submitting' && (
              <span className={styles.spinner} aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="31.4 31.4"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            )}
            {submitState === 'success' && (
              <span className={styles.checkmark} aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
            <span>
              {submitState === 'success'
                ? (t('rejectionFeedbackThankYou') || 'Thank you!')
                : submitState === 'submitting'
                  ? (t('sending') || 'Sending...')
                  : (t('rejectionFeedbackSend') || 'Send Feedback')}
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
