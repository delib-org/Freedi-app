'use client';

import { useState } from 'react';
import styles from './FAB.module.scss';

interface FABProps {
  onSubmit: (solution: string) => Promise<void>;
  isDisabled?: boolean;
}

/**
 * Floating Action Button with Expandable Solution Form
 * Delightful interaction for submitting new solutions
 */
export default function FAB({ onSubmit, isDisabled = false }: FABProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [solution, setSolution] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleToggle = () => {
    if (!isDisabled) {
      setIsExpanded(!isExpanded);
      if (!isExpanded) {
        setSolution('');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!solution.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(solution);
      setSolution('');
      setIsExpanded(false);
      setShowSuccess(true);

      // Show success animation
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Failed to submit solution:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Main FAB Container */}
      <div className={`${styles.fabContainer} ${isExpanded ? styles.expanded : ''}`}>
        {/* Expandable Form */}
        {isExpanded && (
          <form className={styles.solutionForm} onSubmit={handleSubmit}>
            <div className={styles.formHeader}>
              <h3 className={styles.formTitle}>
                <span className={styles.titleIcon}>💡</span>
                Share Your Solution
              </h3>
              <button
                type="button"
                className={styles.closeButton}
                onClick={handleToggle}
                aria-label="Close form"
              >
                ✕
              </button>
            </div>

            <textarea
              className={styles.solutionInput}
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              placeholder="Type your brilliant idea here... What's your solution?"
              maxLength={500}
              autoFocus
              disabled={isSubmitting}
            />

            <div className={styles.characterCount}>
              <span className={solution.length > 450 ? styles.countWarning : ''}>
                {solution.length}/500
              </span>
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={handleToggle}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={!solution.trim() || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className={styles.spinner}></span>
                    Submitting...
                  </>
                ) : (
                  <>
                    <span className={styles.submitIcon}>🚀</span>
                    Submit Solution
                  </>
                )}
              </button>
            </div>

            {/* Decorative Elements */}
            <div className={styles.formDecoration}>
              <span className={styles.decorEmoji}>✨</span>
              <span className={styles.decorEmoji}>🌟</span>
              <span className={styles.decorEmoji}>💫</span>
            </div>
          </form>
        )}

        {/* FAB Button */}
        <button
          className={`${styles.fab} ${isExpanded ? styles.fabExpanded : ''} ${
            isDisabled ? styles.fabDisabled : ''
          }`}
          onClick={handleToggle}
          disabled={isDisabled}
          aria-label={isExpanded ? 'Close solution form' : 'Add new solution'}
        >
          <span className={styles.fabIcon}>
            {isExpanded ? '✕' : '+'}
          </span>
          {!isExpanded && (
            <span className={styles.fabPulse}></span>
          )}
        </button>

        {/* Tooltip */}
        {!isExpanded && !isDisabled && (
          <div className={styles.tooltip}>
            Add Solution
          </div>
        )}
      </div>

      {/* Success Notification */}
      {showSuccess && (
        <div className={styles.successNotification}>
          <div className={styles.successContent}>
            <span className={styles.successIcon}>🎉</span>
            <div className={styles.successText}>
              <h4>Solution Submitted!</h4>
              <p>Thank you for contributing to the consensus!</p>
            </div>
          </div>
          <div className={styles.successConfetti}>
            {[...Array(8)].map((_, i) => (
              <span key={i} className={styles.confettiPiece} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}