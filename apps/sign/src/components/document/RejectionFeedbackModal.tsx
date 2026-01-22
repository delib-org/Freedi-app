'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import Modal from '../shared/Modal';
import { trackRejectionFeedback } from '@/lib/analytics';
import styles from './RejectionFeedbackModal.module.scss';

interface RejectionFeedbackModalProps {
  documentId: string;
  onClose: () => void;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export default function RejectionFeedbackModal({
  documentId,
  onClose,
}: RejectionFeedbackModalProps) {
  const { t } = useTranslation();
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

  const handleSubmit = async () => {
    setSubmitState('submitting');
    setErrorMessage('');

    try {
      const response = await fetch(`/api/signatures/${documentId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (response.ok) {
        setSubmitState('success');
        trackRejectionFeedback(documentId);
        // Wait for thank you animation before closing
        setTimeout(() => {
          onClose();
          window.location.reload();
        }, 800);
      } else {
        const error = await response.json();
        setSubmitState('error');
        setErrorMessage(error.error || t('rejectionFeedbackError') || 'Could not send feedback. You can try again or skip.');
      }
    } catch {
      setSubmitState('error');
      setErrorMessage(t('rejectionFeedbackError') || 'Could not send feedback. You can try again or skip.');
    }
  };

  const handleClose = () => {
    // Same as skip - just close and reload
    handleSkip();
  };

  return (
    <Modal
      title={t('rejectionFeedbackTitle') || 'Help us improve'}
      onClose={handleClose}
      size="small"
    >
      <div className={styles.feedbackContent}>
        <p className={styles.description}>
          {t('rejectionFeedbackBody') || 'Can you share why you rejected this document? Your feedback helps us create better documents.'}
        </p>

        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder={t('rejectionFeedbackPlaceholder') || 'Share your thoughts... (optional)'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label={t('rejectionFeedbackPlaceholder') || 'Rejection feedback (optional)'}
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
