'use client';

import { useState } from 'react';
import { Statement } from 'delib-npm';
import styles from './AddSolutionForm.module.css';

interface AddSolutionFormProps {
  questionId: string;
  userId: string;
  onSubmit: (solution: Statement) => void;
}

/**
 * Form for submitting new solutions
 */
export default function AddSolutionForm({
  questionId,
  userId,
  onSubmit,
}: AddSolutionFormProps) {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const characterCount = text.length;
  const isValid = characterCount >= 3 && characterCount <= 500;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/statements/${questionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solutionText: text,
          userId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit solution');
      }

      const data = await response.json();

      // Clear form
      setText('');
      setShowSuccess(true);

      // Call onSubmit callback
      if (data.solution) {
        onSubmit(data.solution);
      }

      // Hide success message after 3 seconds
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Submit error:', error);
      setError(error instanceof Error ? error.message : 'Failed to submit solution');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.formContainer}>
      <h3 className={styles.title}>Add Your Solution</h3>

      {showSuccess && (
        <div className={styles.success}>
          ✓ Thank you! Your solution has been submitted.
        </div>
      )}

      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your solution here..."
          className={styles.textarea}
          rows={4}
          maxLength={500}
          disabled={isSubmitting}
        />

        <div className={styles.footer}>
          <span className={`${styles.characterCount} ${!isValid && characterCount > 0 ? styles.invalid : ''}`}>
            {characterCount}/500 characters
            {characterCount < 3 && characterCount > 0 && ' (minimum 3)'}
          </span>

          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className={`${styles.submitButton} ${!isValid || isSubmitting ? styles.disabled : ''}`}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Solution'}
          </button>
        </div>
      </form>
    </div>
  );
}
