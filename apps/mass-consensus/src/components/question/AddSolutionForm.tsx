'use client';

import { useState } from 'react';
import { VALIDATION, UI } from '@/constants/common';
import styles from './AddSolutionForm.module.css';

interface AddSolutionFormProps {
  questionId: string;
  userId: string;
  onSubmit: (solutionText: string) => void;
}

/**
 * Form for submitting new solutions
 * Now integrated with similar solution detection flow
 */
export default function AddSolutionForm({
  questionId: _questionId,
  userId: _userId,
  onSubmit,
}: AddSolutionFormProps) {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const characterCount = text.length;
  const isValid =
    characterCount >= VALIDATION.MIN_SOLUTION_LENGTH &&
    characterCount <= VALIDATION.MAX_SOLUTION_LENGTH;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);

    // Pass text to parent for similar checking
    onSubmit(text);

    // Clear form after a short delay
    setTimeout(() => {
      setText('');
      setIsSubmitting(false);
    }, UI.FORM_RESET_DELAY);
  };

  return (
    <div className={styles.formContainer}>
      <h3 className={styles.title}>Add Your Solution</h3>

      <form onSubmit={handleSubmit} className={styles.form}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your solution here..."
          className={styles.textarea}
          rows={4}
          maxLength={VALIDATION.MAX_SOLUTION_LENGTH}
          disabled={isSubmitting}
        />

        <div className={styles.footer}>
          <span
            className={`${styles.characterCount} ${
              !isValid && characterCount > 0 ? styles.invalid : ''
            }`}
          >
            {characterCount}/{VALIDATION.MAX_SOLUTION_LENGTH} characters
            {characterCount < VALIDATION.MIN_SOLUTION_LENGTH &&
              characterCount > 0 &&
              ` (minimum ${VALIDATION.MIN_SOLUTION_LENGTH})`}
          </span>

          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className={`${styles.submitButton} ${!isValid || isSubmitting ? styles.disabled : ''}`}
          >
            {isSubmitting ? 'Checking...' : 'Submit Solution'}
          </button>
        </div>
      </form>
    </div>
  );
}
