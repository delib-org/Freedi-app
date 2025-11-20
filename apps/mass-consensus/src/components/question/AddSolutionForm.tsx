'use client';

import { useState } from 'react';
import { Statement } from 'delib-npm';
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
  questionId,
  userId,
  onSubmit,
}: AddSolutionFormProps) {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const characterCount = text.length;
  const isValid = characterCount >= 3 && characterCount <= 500;

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
    }, 300);
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
            {isSubmitting ? 'Checking...' : 'Submit Solution'}
          </button>
        </div>
      </form>
    </div>
  );
}
