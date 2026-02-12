'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './EvaluationButtons.module.css';

interface EvaluationButtonsProps {
  onEvaluate: (score: number, direction?: 'left' | 'right') => void;
  currentScore?: number | null;
  showLabels?: boolean;
  compact?: boolean;
}

// Evaluation scale: -1, -0.5, 0, 0.5, 1
const EVALUATION_SCORES = [
  { score: -1, labelKey: 'Strongly disagree', emoji: '😠', direction: 'left' as const, colorClass: 'hate' },
  { score: -0.5, labelKey: 'Disagree', emoji: '👎', direction: 'left' as const, colorClass: 'dislike' },
  { score: 0, labelKey: 'Neutral', emoji: '🤷', direction: null, colorClass: 'neutral' },
  { score: 0.5, labelKey: 'Agree', emoji: '👍', direction: 'right' as const, colorClass: 'like' },
  { score: 1, labelKey: 'Strongly agree', emoji: '😍', direction: 'right' as const, colorClass: 'love' },
];

/**
 * Evaluation buttons component
 * 5-point scale from -1 to 1 with pastel colors
 */
export default function EvaluationButtons({
  onEvaluate,
  currentScore,
  showLabels = false,
  compact = false,
}: EvaluationButtonsProps) {
  const { t } = useTranslation();
  const [selectedScore, setSelectedScore] = useState<number | null>(currentScore ?? null);

  // Sync with currentScore prop when it changes (e.g., loaded from server)
  useEffect(() => {
    if (currentScore !== undefined && currentScore !== null) {
      setSelectedScore(currentScore);
    }
  }, [currentScore]);

  const evaluationOptions = useMemo(
    () =>
      EVALUATION_SCORES.map((option) => ({
        ...option,
        label: t(option.labelKey),
      })),
    [t]
  );

  const handleClick = (score: number, direction: 'left' | 'right' | null) => {
    setSelectedScore(score);
    onEvaluate(score, direction || undefined);
  };

  return (
    <div className={`${styles.buttons} ${compact ? styles.compact : ''}`}>
      {evaluationOptions.map(({ score, label, emoji, direction, colorClass }) => (
        <button
          key={score}
          onClick={() => handleClick(score, direction)}
          className={`${styles.button} ${styles[colorClass]} ${
            selectedScore === score ? styles.selected : ''
          }`}
          title={label}
          aria-label={label}
        >
          <span className={styles.emoji}>{emoji}</span>
          {showLabels && <span className={styles.label}>{label}</span>}
          {!showLabels && !compact && (
            <span className={styles.score}>{score > 0 ? '+' : ''}{score}</span>
          )}
        </button>
      ))}
    </div>
  );
}
