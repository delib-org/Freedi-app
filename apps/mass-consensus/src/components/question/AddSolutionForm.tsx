'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { VALIDATION, UI } from '@/constants/common';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './AddSolutionForm.module.css';

interface AddSolutionFormProps {
  questionId: string;
  userId: string;
  onSubmit: (solutionText: string) => void;
}

const MAX_ROWS = 8;
const LINE_HEIGHT = 24; // px

/**
 * Form for submitting new solutions
 * Fixed at bottom with auto-growing textarea
 */
export default function AddSolutionForm({
  questionId: _questionId,
  userId: _userId,
  onSubmit,
}: AddSolutionFormProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [mounted, setMounted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // For portal to work in Next.js
  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-grow textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = LINE_HEIGHT * MAX_ROWS;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [text]);
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

  const formContent = (
    <div className={styles.fixedContainer}>
      <h3 className={styles.title}>{t('Add Your Solution')}</h3>

      <form onSubmit={handleSubmit} className={styles.form}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('Type your solution here...')}
          className={styles.textarea}
          rows={1}
          maxLength={VALIDATION.MAX_SOLUTION_LENGTH}
          disabled={isSubmitting}
        />

        <div className={styles.footer}>
          <span
            className={`${styles.characterCount} ${
              !isValid && characterCount > 0 ? styles.invalid : ''
            }`}
          >
            {characterCount}/{VALIDATION.MAX_SOLUTION_LENGTH} {t('characters')}
            {characterCount < VALIDATION.MIN_SOLUTION_LENGTH &&
              characterCount > 0 &&
              ` (${t('minimum')} ${VALIDATION.MIN_SOLUTION_LENGTH})`}
          </span>

          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className={`${styles.submitButton} ${!isValid || isSubmitting ? styles.disabled : ''}`}
          >
            {isSubmitting ? t('Loading...') : t('Submit Solution')}
          </button>
        </div>
      </form>
    </div>
  );

  // Use portal to render at body level for true fixed positioning
  if (!mounted) return null;

  return createPortal(formContent, document.body);
}
