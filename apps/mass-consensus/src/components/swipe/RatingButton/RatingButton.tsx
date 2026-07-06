'use client';

/**
 * RatingButton Component
 *
 * Displays a single evaluation option with a face/emoji and accessible label.
 * Mode-aware via the shared cross-app scale (`getEvaluationScale`):
 * - 'agree-disagree' (default): signed -1..1 scale, SVG thumbs.
 * - 'reactions': positive 0..1 scale, emoji reactions.
 *
 * Design principles:
 * - Emoji-only display for universal clarity
 * - Color-coded backgrounds indicate intensity
 * - Circular buttons for consistent tap targets
 * - Scale effect on interaction for tactile feedback
 */

import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import clsx from 'clsx';
import { getEvaluationEntry } from '@freedi/shared-types';
import type { RatingMode } from '@freedi/shared-types';
import { playClickSound } from '../SwipeCard/soundEffects';
import EvaluationFace from '@/components/icons/EvaluationFace';

/** Any evaluation value from either mode (-1..1 or 0..1). */
export type RatingValue = number;

export interface RatingButtonProps {
  rating: RatingValue;
  /** Evaluation mode; undefined = agree-disagree (default). */
  ratingMode?: RatingMode;
  onClick: (rating: RatingValue) => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  isSelected?: boolean;
  className?: string;
}

export default function RatingButton({
  rating,
  ratingMode,
  onClick,
  disabled = false,
  size = 'medium',
  isSelected = false,
  className,
}: RatingButtonProps) {
  const { t } = useTranslation();
  const entry = getEvaluationEntry(rating, ratingMode);

  const handleClick = () => {
    if (disabled) return;
    playClickSound();
    onClick(rating);
  };

  const classes = clsx(
    'rating-button',
    entry && `rating-button--${entry.variant}`,
    size !== 'medium' && `rating-button--${size}`,
    disabled && 'rating-button--disabled',
    isSelected && 'rating-button--selected',
    className
  );

  const label = entry ? t(entry.labelKey) : '';

  return (
    <button
      type="button"
      className={classes}
      onClick={handleClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <span className="rating-button__emoji">
        <EvaluationFace value={rating} mode={ratingMode} />
      </span>
      <span className="rating-button__label">{entry ? t(entry.shortLabelKey) : ''}</span>
    </button>
  );
}
