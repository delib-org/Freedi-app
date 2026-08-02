'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { useUIStore } from '@/store/uiStore';
import { SATISFACTION_SCORES, SatisfactionScore } from '@/types';
import RatingIcon from './RatingIcon';
import styles from './SatisfactionScale.module.scss';

interface SatisfactionScaleProps {
  /** The user's current satisfaction rating, if any */
  currentScore?: number;
}

const SCORE_VARIANTS: Record<SatisfactionScore, string> = {
  [-1]: 'hate',
  [-0.5]: 'dislike',
  [0]: 'neutral',
  [0.5]: 'like',
  [1]: 'love',
};

const SCORE_LABEL_KEYS: Record<SatisfactionScore, { key: string; fallback: string }> = {
  [-1]: { key: 'satisfactionVeryUnsatisfied', fallback: 'Very unsatisfied' },
  [-0.5]: { key: 'satisfactionUnsatisfied', fallback: 'Unsatisfied' },
  [0]: { key: 'satisfactionNeutral', fallback: 'Neutral' },
  [0.5]: { key: 'satisfactionSatisfied', fallback: 'Satisfied' },
  [1]: { key: 'satisfactionVerySatisfied', fallback: 'Very satisfied' },
};

/**
 * Satisfaction rating scale (-1 to +1) shown in the document footer
 * when the admin sets footerMode to 'satisfaction'.
 *
 * Buttons carry data-action="satisfy" + data-score attributes; the click
 * is handled by the global listener in DocumentClient (same pattern as
 * the Sign/Reject buttons).
 */
export default function SatisfactionScale({ currentScore }: SatisfactionScaleProps) {
  const { t } = useTranslation();
  const { isSubmitting } = useUIStore();

  return (
    <div
      className={styles.scale}
      role="group"
      aria-label={t('satisfactionQuestion') || 'What do you think about this proposal?'}
    >
      {SATISFACTION_SCORES.map((score) => {
        const { key, fallback } = SCORE_LABEL_KEYS[score];
        const label = t(key) || fallback;
        const isSelected = currentScore === score;

        return (
          <button
            key={score}
            type="button"
            data-action="satisfy"
            data-score={score}
            className={`${styles.scaleButton} ${styles[SCORE_VARIANTS[score]]} ${isSelected ? styles.selected : ''}`}
            disabled={isSubmitting}
            aria-pressed={isSelected}
            aria-label={label}
            title={label}
          >
            <span className={styles.icon}>
              <RatingIcon rating={score} />
            </span>
            <span className={styles.label}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
