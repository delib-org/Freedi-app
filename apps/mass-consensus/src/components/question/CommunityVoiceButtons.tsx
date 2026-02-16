'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './CommunityVoiceButtons.module.css';

interface CommunityVoiceButtonsProps {
  onEvaluate: (score: number, direction?: 'left' | 'right') => void;
  currentScore?: number | null;
  showLabels?: boolean;
  compact?: boolean;
}

const COMMUNITY_VOICE_SCORES = [
  { score: 0.25, labelKey: 'I hear this perspective', level: 1, direction: 'right' as const },
  { score: 0.5, labelKey: 'I partly relate', level: 2, direction: 'right' as const },
  { score: 0.75, labelKey: 'I closely relate to this', level: 3, direction: 'right' as const },
  { score: 1, labelKey: 'This echoes my community\'s voice', level: 4, direction: 'right' as const },
];

export default function CommunityVoiceButtons({
  onEvaluate,
  currentScore,
  showLabels = false,
  compact = false,
}: CommunityVoiceButtonsProps) {
  const { t } = useTranslation();
  const [selectedScore, setSelectedScore] = useState<number | null>(currentScore ?? null);

  useEffect(() => {
    if (currentScore !== undefined && currentScore !== null) {
      setSelectedScore(currentScore);
    }
  }, [currentScore]);

  const options = useMemo(
    () =>
      COMMUNITY_VOICE_SCORES.map((option) => ({
        ...option,
        label: t(option.labelKey),
      })),
    [t]
  );

  const handleClick = (score: number, direction: 'left' | 'right') => {
    setSelectedScore(score);
    onEvaluate(score, direction);
  };

  return (
    <div className={`${styles.buttons} ${compact ? styles.compact : ''}`}>
      {options.map(({ score, label, level, direction }) => (
        <button
          key={score}
          onClick={() => handleClick(score, direction)}
          className={`${styles.button} ${styles[`level${level}`]} ${
            selectedScore === score ? styles.selected : ''
          }`}
          title={label}
          aria-label={label}
        >
          <span className={styles.rippleIcon}>
            <RippleIcon level={level} />
          </span>
          {showLabels && <span className={styles.label}>{label}</span>}
          {!showLabels && !compact && (
            <span className={styles.label}>{label}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function RippleIcon({ level }: { level: number }) {
  const opacity = 0.25 + (level - 1) * 0.2;

  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="3" fill="#5B8A9A" opacity={Math.min(opacity + 0.15, 1)} />
      {level >= 2 && (
        <circle cx="12" cy="12" r="6.5" stroke="#5B8A9A" strokeWidth="1.2" opacity={opacity} fill="none" />
      )}
      {level >= 3 && (
        <circle cx="12" cy="12" r="9.5" stroke="#5B8A9A" strokeWidth="1.2" opacity={Math.max(opacity - 0.15, 0.2)} fill="none" />
      )}
      {level >= 4 && (
        <circle cx="12" cy="12" r="11.5" stroke="#5B8A9A" strokeWidth="1.2" opacity={Math.max(opacity - 0.3, 0.15)} fill="none" />
      )}
    </svg>
  );
}
