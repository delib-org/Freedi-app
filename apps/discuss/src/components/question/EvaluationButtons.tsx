'use client';

import { useState } from 'react';
import styles from './EvaluationButtons.module.css';

interface EvaluationButtonsProps {
  onEvaluate: (score: number) => void;
  disabled?: boolean;
}

// Evaluation scale: -1, -0.5, 0, 0.5, 1
const EVALUATION_OPTIONS = [
  { score: -1, label: 'Strongly disagree', emoji: '👎👎' },
  { score: -0.5, label: 'Disagree', emoji: '👎' },
  { score: 0, label: 'Neutral', emoji: '🤷' },
  { score: 0.5, label: 'Agree', emoji: '👍' },
  { score: 1, label: 'Strongly agree', emoji: '👍👍' },
];

/**
 * Evaluation buttons component
 * 5-point scale from -1 to 1
 */
export default function EvaluationButtons({
  onEvaluate,
  disabled,
}: EvaluationButtonsProps) {
  const [selectedScore, setSelectedScore] = useState<number | null>(null);

  const handleClick = (score: number) => {
    if (disabled) return;

    setSelectedScore(score);
    onEvaluate(score);
  };

  return (
    <div className={styles.buttons}>
      {EVALUATION_OPTIONS.map(({ score, label, emoji }) => (
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
