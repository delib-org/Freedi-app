'use client';

import { useState } from 'react';
import styles from './AIFeedbackButton.module.css';

interface AIFeedbackButtonProps {
  questionId: string;
  userId: string;
}

/**
 * Client Component - AI Feedback button and modal
 * Fetches personalized feedback using Gemini API
 */
export default function AIFeedbackButton({
  questionId,
  userId,
}: AIFeedbackButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const handleGetFeedback = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to get feedback');
      }

      const data = await response.json();
      setFeedback(data.feedback);
      setShowModal(true);
    } catch (error) {
      console.error('AI feedback error:', error);
      setError('Failed to get feedback. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className={styles.container}>
        <h3>Want to improve your solutions?</h3>
        <p>Get personalized AI feedback based on top-performing solutions</p>
        <button
          onClick={handleGetFeedback}
          disabled={isLoading}
          className={`${styles.button} ${isLoading ? styles.loading : ''}`}
        >
          {isLoading ? 'Generating feedback...' : 'Get AI Feedback'}
        </button>
        {error && <p className={styles.error}>{error}</p>}
      </div>

      {/* Modal */}
      {showModal && feedback && (
        <div className={styles.modal} onClick={() => setShowModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>AI Feedback</h2>
              <button
                onClick={() => setShowModal(false)}
                className={styles.closeButton}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.feedback}>{feedback}</div>
            </div>
            <div className={styles.modalFooter}>
              <button
                onClick={() => setShowModal(false)}
                className={styles.closeButtonBottom}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
