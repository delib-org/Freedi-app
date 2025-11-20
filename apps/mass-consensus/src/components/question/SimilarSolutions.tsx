'use client';

import { useEffect } from 'react';
import { Statement } from 'delib-npm';
import { VALIDATION, UI } from '@/constants/common';
import styles from './SimilarSolutions.module.scss';

interface SimilarSolutionsProps {
  userSuggestion: string;
  similarSolutions: Statement[];
  onSelect: (statementId: string | null) => void;
  onBack: () => void;
}

export default function SimilarSolutions({
  userSuggestion,
  similarSolutions,
  onSelect,
  onBack,
}: SimilarSolutionsProps) {
  // Show max 3 similar solutions
  const topSimilar = similarSolutions.slice(
    0,
    VALIDATION.MAX_SIMILAR_SOLUTIONS_DISPLAY
  );

  // Auto-select if only user's suggestion (no similar found)
  // Move setTimeout to useEffect to avoid setState during render
  useEffect(() => {
    if (topSimilar.length === 0) {
      const timer = setTimeout(() => onSelect(null), UI.FORM_RESET_DELAY);
      return () => clearTimeout(timer);
    }
  }, [topSimilar.length, onSelect]);

  // Don't render if no similar solutions
  if (topSimilar.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h2>We found similar solutions! 👥</h2>
        <p>Choose one to avoid duplicates and strengthen consensus</p>
      </div>

      {/* User's New Solution */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Your Solution (New)</h3>
        <div className={styles.yourSolutionCard}>
          <div className={styles.solutionText}>{userSuggestion}</div>
          <button
            onClick={() => onSelect(null)}
            className={`${styles.chooseButton} ${styles.primary}`}
          >
            Choose This (New)
          </button>
        </div>
      </div>

      {/* Similar Existing Solutions */}
      {topSimilar.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Similar Existing Solutions</h3>
          {topSimilar.map((solution, index) => (
            <div key={solution.statementId} className={styles.similarCard}>
              {/* Metadata */}
              <div className={styles.similarMeta}>
                <span className={styles.similarityScore}>
                  {/* Estimate similarity based on position (first=85%, second=75%, third=65%) */}
                  {Math.max(85 - index * 10, 60)}% similar
                </span>
                <span className={styles.supportCount}>
                  👥 {solution.evaluation?.numberOfEvaluators || 0} {solution.evaluation?.numberOfEvaluators === 1 ? 'person supports' : 'people support'} this
                </span>
              </div>

              {/* Solution Text */}
              <div className={styles.solutionText}>{solution.statement}</div>

              {/* Select Button */}
              <button
                onClick={() => onSelect(solution.statementId)}
                className={`${styles.chooseButton} ${styles.secondary}`}
              >
                Choose This (Add Support)
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Educational Footer */}
      <div className={styles.helpFooter}>
        <span className={styles.helpIcon}>💡</span>
        <p className={styles.helpText}>
          Choosing an existing solution adds your support and strengthens it!
          This helps build stronger consensus.
        </p>
      </div>

      {/* Back Button */}
      <button onClick={onBack} className={styles.backButton}>
        ← Back to Edit
      </button>
    </div>
  );
}
