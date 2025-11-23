'use client';

import { useState } from 'react';
import Modal from '@/components/shared/Modal';
import { VALIDATION } from '@/constants/common';
import styles from './SolutionPromptModal.module.css';

interface SolutionPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  questionId: string;
  userId: string;
  onSubmitSuccess: () => void;
}

export default function SolutionPromptModal({
  isOpen,
  onClose,
  questionId,
  userId,
  onSubmitSuccess,
}: SolutionPromptModalProps) {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const characterCount = text.length;
  const isValid =
    characterCount >= VALIDATION.MIN_SOLUTION_LENGTH &&
    characterCount <= VALIDATION.MAX_SOLUTION_LENGTH;

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Submit the solution directly
      const response = await fetch(`/api/statements/${questionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solutionText: text,
          userId,
          existingStatementId: null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit solution');
      }

      // Success - clear form and close modal
      setText('');
      onClose();
      onSubmitSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit solution');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setText('');
    setError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Your Solution First">
      <div className={styles.content}>
        <p className={styles.description}>
          Please share your idea before seeing and rating others.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your solution here..."
          className={styles.textarea}
          rows={4}
          maxLength={VALIDATION.MAX_SOLUTION_LENGTH}
          disabled={isSubmitting}
          autoFocus
        />

        <div className={styles.charCount}>
          <span className={characterCount < VALIDATION.MIN_SOLUTION_LENGTH ? styles.invalid : ''}>
            {characterCount}/{VALIDATION.MAX_SOLUTION_LENGTH}
          </span>
          {characterCount > 0 && characterCount < VALIDATION.MIN_SOLUTION_LENGTH && (
            <span className={styles.hint}> (minimum {VALIDATION.MIN_SOLUTION_LENGTH} characters)</span>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button
            className={styles.cancelButton}
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className={styles.primaryButton}
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
