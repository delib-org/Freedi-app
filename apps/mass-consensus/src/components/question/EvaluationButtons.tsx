'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { getEvaluationScale } from '@freedi/shared-types';
import type { RatingMode } from '@freedi/shared-types';
import styles from './EvaluationButtons.module.css';
import EvaluationFace from '@/components/icons/EvaluationFace';

interface EvaluationButtonsProps {
  onEvaluate: (score: number, direction?: 'left' | 'right') => void;
  currentScore?: number | null;
  /** Evaluation mode; undefined = agree-disagree (default). */
  ratingMode?: RatingMode;
  showLabels?: boolean;
  compact?: boolean;
}

// Positional pastel color classes (left→right), reused for both modes.
const COLOR_CLASSES = ['hate', 'dislike', 'neutral', 'like', 'love'] as const;

/**
 * Evaluation buttons component
 * Mode-aware 5-point scale driven by the shared cross-app scale:
 * - 'agree-disagree' (default): signed -1..1, SVG thumbs.
 * - 'reactions': positive 0..1 emoji reactions.
 */
export default function EvaluationButtons({
  onEvaluate,
  currentScore,
  ratingMode,
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
      getEvaluationScale(ratingMode).map((entry) => {
        const rawDirection = entry.direction === 'up' ? null : entry.direction;

        return {
          score: entry.value,
          label: t(entry.labelKey),
          direction: rawDirection,
          colorClass: COLOR_CLASSES[entry.zoneIndex] ?? 'neutral',
        };
      }),
    [t, ratingMode]
  );

  const handleClick = (score: number, direction: 'left' | 'right' | null) => {
    setSelectedScore(score);
    onEvaluate(score, direction || undefined);
  };

  return (
    <div className={`${styles.buttons} ${compact ? styles.compact : ''}`}>
      {evaluationOptions.map(({ score, label, direction, colorClass }) => (
        <button
          key={score}
          onClick={() => handleClick(score, direction)}
          className={`${styles.button} ${styles[colorClass]} ${
            selectedScore === score ? styles.selected : ''
          }`}
          title={label}
          aria-label={label}
        >
          <span className={styles.emoji}><EvaluationFace value={score} mode={ratingMode} /></span>
          {showLabels && <span className={styles.label}>{label}</span>}
          {!showLabels && !compact && (
            <span className={styles.score}>{score > 0 ? '+' : ''}{score}</span>
          )}
        </button>
      ))}
    </div>
  );
}
