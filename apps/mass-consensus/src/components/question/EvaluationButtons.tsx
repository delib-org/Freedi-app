'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './EvaluationButtons.module.css';

interface EvaluationButtonsProps {
  onEvaluate: (score: number) => void;
  disabled?: boolean;
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
  disabled,
}: EvaluationButtonsProps) {
  const { t } = useTranslation();
  const [selectedScore, setSelectedScore] = useState<number | null>(null);

  const evaluationOptions = useMemo(
    () =>
      EVALUATION_SCORES.map((option) => ({
        ...option,
        label: t(option.labelKey),
      })),
    [t]
  );

  const handleClick = (score: number) => {
    if (disabled) return;

    setSelectedScore(score);
    onEvaluate(score);
  };

  return (
    <div className={styles.buttons}>
      {evaluationOptions.map(({ score, label, emoji }) => (
        <button
          key={score}
          onClick={() => handleClick(score)}
          disabled={disabled}
          className={`${styles.button} ${
            selectedScore === score ? styles.selected : ''
          } ${disabled ? styles.disabled : ''}`}
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
