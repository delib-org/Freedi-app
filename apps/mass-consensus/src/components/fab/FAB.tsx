'use client';

import React, { useState } from 'react';
import styles from './FAB.module.scss';

interface FABProps {
  onSubmit: (text: string) => Promise<void>;
}

const FAB: React.FC<FABProps> = ({ onSubmit }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!solutionText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(solutionText);
      setSolutionText('');
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setIsExpanded(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to submit solution:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleExpand = () => {
    if (!isExpanded) {
      setIsExpanded(true);
      setShowSuccess(false);
    } else {
      setIsExpanded(false);
      setSolutionText('');
    }
  };

  return (
    <>
      {/* Floating decorative elements */}
      <div className={styles.floatingDecor}>
        <span className={styles.decorEmoji}>💡</span>
        <span className={styles.decorEmoji}>✨</span>
        <span className={styles.decorEmoji}>🌟</span>
      </div>

      <div className={`${styles.fabContainer} ${isExpanded ? styles.expanded : ''}`}>
        {/* Expanded Form */}
        {isExpanded && (
          <div className={styles.expandedContent}>
            <h3 className={styles.formTitle}>
              Share Your Brilliant Idea! 💡
            </h3>
            <form onSubmit={handleSubmit} className={styles.solutionForm}>
              <div className={styles.inputWrapper}>
                <textarea
                  value={solutionText}
                  onChange={(e) => setSolutionText(e.target.value)}
                  placeholder="Type your creative solution here..."
                  className={styles.solutionInput}
                  maxLength={500}
                  rows={4}
                  autoFocus
                />
                <div className={styles.charCount}>
                  <span className={solutionText.length > 400 ? styles.warning : ''}>
                    {solutionText.length}/500
                  </span>
                </div>
              </div>

              <div className={styles.formActions}>
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className={styles.cancelButton}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={!solutionText.trim() || isSubmitting}
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
            </form>
          </div>
        )}

        {/* FAB Button */}
        <button
          onClick={toggleExpand}
          className={`${styles.fabButton} ${isExpanded ? styles.close : ''}`}
          aria-label={isExpanded ? "Close form" : "Add new solution"}
        >
          <span className={styles.fabIcon}>
            {isExpanded ? '✕' : '+'}
          </span>
          {!isExpanded && (
            <span className={styles.fabLabel}>Add Solution</span>
          )}
        </button>

        {/* Success Animation */}
        {showSuccess && (
          <div className={styles.successAnimation}>
            <div className={styles.successContent}>
              <span className={styles.successIcon}>🎉</span>
              <span className={styles.successText}>Solution Submitted!</span>
            </div>
            <div className={styles.confettiContainer}>
              <span className={styles.confetti}>🎊</span>
              <span className={styles.confetti}>✨</span>
              <span className={styles.confetti}>🌟</span>
              <span className={styles.confetti}>💫</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default FAB;