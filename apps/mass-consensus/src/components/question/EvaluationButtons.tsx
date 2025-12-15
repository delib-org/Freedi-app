'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './EvaluationButtons.module.css';

interface EvaluationButtonsProps {
  onEvaluate: (score: number) => void;
  currentScore?: number | null;
}

// Evaluation scale: -1, -0.5, 0, 0.5, 1
const EVALUATION_SCORES = [
  { score: -1, labelKey: 'Strongly disagree', emoji: '👎👎' },
  { score: -0.5, labelKey: 'Disagree', emoji: '👎' },
  { score: 0, labelKey: 'Neutral', emoji: '🤷' },
  { score: 0.5, labelKey: 'Agree', emoji: '👍' },
  { score: 1, labelKey: 'Strongly agree', emoji: '👍👍' },
];

/**
 * Evaluation buttons component
 * 5-point scale from -1 to 1
 */
export default function EvaluationButtons({
  onEvaluate,
  currentScore,
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

  const handleClick = (score: number) => {
    setSelectedScore(score);
    onEvaluate(score);
  };

  return (
    <div className={styles.buttons}>
      {evaluationOptions.map(({ score, label, emoji }) => (
        <button
          key={score}
          onClick={() => handleClick(score)}
          className={`${styles.button} ${
            selectedScore === score ? styles.selected : ''
          }`}
          title={label}
          aria-label={label}
        >
          <span className={styles.emoji}>{emoji}</span>
          <span className={styles.score}>{score > 0 ? '+' : ''}{score}</span>
        </button>
      ))}
    </div>
  );
}
