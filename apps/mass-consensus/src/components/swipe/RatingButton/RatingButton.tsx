'use client';

/**
 * RatingButton Component
 *
 * Displays a single rating option with emoji and accessible label.
 * Uses the new -1 to +1 scale with 0.5 increments for precise agreement measurement.
 *
 * Design principles:
 * - Emoji-only display for universal clarity
 * - Color-coded backgrounds indicate sentiment intensity
 * - Circular buttons for consistent tap targets
 * - Scale effect on interaction for tactile feedback
 */

import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import clsx from 'clsx';
import { RATING, RATING_CONFIG } from '@/constants/common';
import { playClickSound } from '../SwipeCard/soundEffects';

export type RatingValue = (typeof RATING)[keyof typeof RATING];

export interface RatingButtonProps {
  rating: RatingValue;
  onClick: (rating: RatingValue) => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

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
      title={t(config.labelKey)}
    >
      <span className="rating-button__emoji">{config.emoji}</span>
      <span className="rating-button__label">{t(config.shortLabelKey)}</span>
    </button>
  );
}
