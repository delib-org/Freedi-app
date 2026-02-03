'use client';

/**
 * Production RatingButton Component
 * Following CLAUDE.md guidelines
 */

import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import clsx from 'clsx';
import { RATING } from '@/constants/common';
import { playClickSound } from '../SwipeCard/soundEffects';

export type RatingValue = typeof RATING[keyof typeof RATING];

export interface RatingButtonProps {
  rating: RatingValue;
  onClick: (rating: RatingValue) => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const RATING_CONFIG = {
  [RATING.LOVE]: { emoji: '❤️', labelKey: 'Love it', variant: 'love' },
  [RATING.LIKE]: { emoji: '👍', labelKey: 'Like', variant: 'like' },
  [RATING.NEUTRAL]: { emoji: '😐', labelKey: 'Neutral', variant: 'neutral' },
  [RATING.DISLIKE]: { emoji: '👎', labelKey: 'Dislike', variant: 'dislike' },
  [RATING.HATE]: { emoji: '❌', labelKey: 'Strongly dislike', variant: 'hate' },
} as const;

export default function RatingButton({
  rating,
  onClick,
  disabled = false,
  size = 'medium',
  className,
}: RatingButtonProps) {
  const { t } = useTranslation();
  const config = RATING_CONFIG[rating];

  const handleClick = () => {
    if (disabled) return;
    playClickSound();
    onClick(rating);
  };

  const classes = clsx(
    'rating-button',
    `rating-button--${config.variant}`,
    size !== 'medium' && `rating-button--${size}`,
    disabled && 'rating-button--disabled',
    className
  );

  return (
    <button
      type="button"
      className={classes}
      onClick={handleClick}
      disabled={disabled}
      aria-label={t(config.labelKey)}
    >
      <span className="rating-button__emoji">{config.emoji}</span>
      <span className="rating-button__label">{t(config.labelKey)}</span>
    </button>
  );
}
