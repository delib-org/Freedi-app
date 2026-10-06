'use client';

/**
 * The "are you sure?" step shown for a participant's first few swipes.
 * Rendered through a portal so the card's transforms do not move it.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { getEvaluationEntry } from '@freedi/shared-types';
import type { EvaluationScaleKey } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import EvaluationFace from '@/components/icons/EvaluationFace';
import type { RatingValue } from '../RatingButton';

interface SwipeConfirmationProps {
  rating: RatingValue;
  ratingMode?: EvaluationScaleKey;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function SwipeConfirmation({
  rating,
  ratingMode,
  onCancel,
  onConfirm,
}: SwipeConfirmationProps) {
  const { t } = useTranslation();
  const entry = getEvaluationEntry(rating, ratingMode);

  return createPortal(
    <div className="swipe-card__confirmation-overlay">
      <div
        className={clsx(
          'swipe-card__confirmation-modal',
          `swipe-card__confirmation-modal--${entry?.variant ?? 'neutral'}`
        )}
      >
        <div className="swipe-card__confirmation-emoji">
          <EvaluationFace value={rating} mode={ratingMode} />
        </div>
        <h3 className="swipe-card__confirmation-title">
          {t('You have rated it as')}
        </h3>
        <p className="swipe-card__confirmation-rating">
          {t(entry?.labelKey ?? '')}
        </p>
        <p className="swipe-card__confirmation-question" dir="auto">
          {t('Are you sure?')}
        </p>
        <div className="swipe-card__confirmation-buttons">
          <button
            className="swipe-card__confirmation-button swipe-card__confirmation-button--cancel"
            onClick={onCancel}
            type="button"
          >
            {t('No, go back')}
          </button>
          <button
            className="swipe-card__confirmation-button swipe-card__confirmation-button--confirm"
            onClick={onConfirm}
            type="button"
          >
            {t('Yes, confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
