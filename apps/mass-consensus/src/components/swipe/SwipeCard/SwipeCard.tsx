'use client';

/**
 * SwipeCard Component
 *
 * Displays a proposal card with throw animation support.
 *
 * IMPORTANT: Manual swiping is DISABLED.
 * All interactions are through rating buttons only.
 * This ensures data quality with precise 5-level ratings (-1 to +1 scale).
 *
 * The card still has throw animations triggered programmatically
 * when users click rating buttons.
 */

import React, { useRef, useState, useEffect } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import clsx from 'clsx';
import { SWIPE, RATING_CONFIG, RATING } from '@/constants/common';
import { playWhooshSound } from './soundEffects';
import type { RatingValue } from '../RatingButton';

export interface SwipeCardProps {
  statement: Statement;
  onSwipe: (rating: RatingValue) => void | Promise<void>;
  totalCards: number;
  currentIndex: number;
  programmaticThrow?: { rating: RatingValue; direction: 'left' | 'right' } | null;
}

// Get overlay emoji based on throw direction
function getOverlayEmoji(direction: 'left' | 'right' | null): string {
  if (direction === 'right') {
    return RATING_CONFIG[RATING.STRONGLY_AGREE].emoji;
  }
  if (direction === 'left') {
    return RATING_CONFIG[RATING.STRONGLY_DISAGREE].emoji;
  }
  return '';
}

export default function SwipeCard({
  statement,
  onSwipe,
  totalCards,
  currentIndex,
  programmaticThrow,
}: SwipeCardProps) {
  const { t, tWithParams } = useTranslation();

  const [isThrowing, setIsThrowing] = useState(false);
  const [throwDirection, setThrowDirection] = useState<'left' | 'right' | null>(
    null
  );
  const [isEntering, setIsEntering] = useState(true);

  const cardRef = useRef<HTMLDivElement>(null);

  // Reset state when statement changes (new card)
  useEffect(() => {
    setIsThrowing(false);
    setThrowDirection(null);
    setIsEntering(true);

    const timer = setTimeout(() => {
      setIsEntering(false);
    }, SWIPE.CARD_ENTER_DURATION);

    return () => clearTimeout(timer);
  }, [statement.statementId]);

  // Handle programmatic throw (from button clicks)
  useEffect(() => {
    if (programmaticThrow && !isThrowing && !isEntering) {
      const { rating, direction } = programmaticThrow;

      setThrowDirection(direction);
      setIsThrowing(true);

      playWhooshSound();

      setTimeout(() => {
        onSwipe(rating);
      }, SWIPE.SWIPE_DURATION);
    }
  }, [programmaticThrow, isThrowing, isEntering, onSwipe]);

  // Calculate rotation based on throw direction
  const rotation = isThrowing ? (throwDirection === 'right' ? 30 : -30) : 0;

  // Show overlay during throw
  const showOverlay = isThrowing;
  const overlayEmoji = getOverlayEmoji(throwDirection);

  // CSS classes
  const cardClasses = clsx('swipe-card', {
    'swipe-card--throwing': isThrowing,
    'swipe-card--entering': isEntering,
    'swipe-card--idle': !isThrowing && !isEntering,
    'swipe-card--like-active': showOverlay && throwDirection === 'right',
    'swipe-card--dislike-active': showOverlay && throwDirection === 'left',
  });

  return (
    <div
      ref={cardRef}
      className={cardClasses}
      role="article"
      aria-label={`${tWithParams('Proposal {{index}} of {{total}}', { index: currentIndex + 1, total: totalCards })}: ${statement.statement}`}
      tabIndex={0}
      style={{
        transform: isThrowing
          ? `translateX(${throwDirection === 'right' ? 1000 : -1000}px) rotate(${rotation}deg) scale(1)`
          : isEntering
            ? `translateX(0) rotate(0) scale(0.8)`
            : `translateX(0) rotate(0) scale(1)`,
        opacity: isThrowing || isEntering ? 0 : 1,
        transition: isThrowing
          ? `transform ${SWIPE.SWIPE_DURATION}ms ease-out, opacity ${SWIPE.SWIPE_DURATION}ms ease-out`
          : isEntering
            ? `transform ${SWIPE.CARD_ENTER_DURATION}ms ease-out, opacity ${SWIPE.CARD_ENTER_DURATION}ms ease-out`
            : 'transform 0.2s',
      }}
    >
      {/* Overlay emoji during throw */}
      {showOverlay && <div className="swipe-card__overlay">{overlayEmoji}</div>}

      {/* Card content */}
      <div className="swipe-card__content">{statement.statement}</div>

      {/* Author info */}
      {statement.creator && (
        <div className="swipe-card__author">
          {statement.creator.photoURL && (
            <img src={statement.creator.photoURL} alt="" loading="lazy" />
          )}
          <span>{statement.creator.displayName}</span>
        </div>
      )}

      {/* Screen reader announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {currentIndex + 1} {t('of')} {totalCards}
      </div>
    </div>
  );
}
