'use client';

/**
 * SwipeCard Component
 *
 * Displays a proposal card with swipe gesture and throw animation support.
 *
 * Interaction modes:
 * - Manual swipe (touch/mouse): Swipe left/right to rate
 * - Button clicks: Click rating buttons to rate with precise values
 *
 * Rating scale (-1 to +1):
 * - Strong swipe right (>160px) = +1 (Strongly Agree)
 * - Moderate swipe right (>80px) = +0.5 (Agree)
 * - Moderate swipe left (<-80px) = -0.5 (Disagree)
 * - Strong swipe left (<-160px) = -1 (Strongly Disagree)
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
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

  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isThrowing, setIsThrowing] = useState(false);
  const [throwDirection, setThrowDirection] = useState<'left' | 'right' | null>(
    null
  );
  const [isEntering, setIsEntering] = useState(true);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Reset state when statement changes (new card)
  useEffect(() => {
    setDragX(0);
    setDragStart(null);
    setIsDragging(false);
    setIsThrowing(false);
    setThrowDirection(null);
    setIsEntering(true);

    const timer = setTimeout(() => {
      setIsEntering(false);
    }, SWIPE.CARD_ENTER_DURATION);

    return () => clearTimeout(timer);
  }, [statement.statementId]);

  // Handle drag start (touch/mouse)
  const handleDragStart = useCallback((clientX: number, isTouch: boolean) => {
    if (isThrowing || isEntering) return;
    setIsTouchDevice(isTouch);
    setDragStart(clientX);
    setIsDragging(true);
  }, [isThrowing, isEntering]);

  // Handle drag move
  const handleDragMove = useCallback((clientX: number) => {
    if (dragStart === null || isThrowing) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      const delta = clientX - dragStart;
      setDragX(delta);

      // Auto-throw when threshold reached
      if (Math.abs(delta) >= SWIPE.AGREE_THRESHOLD && !isThrowing) {
        handleAutoThrow(delta);
      }
    });
  }, [dragStart, isThrowing]);

  // Handle auto-throw based on swipe distance
  const handleAutoThrow = useCallback((delta: number) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    let rating: RatingValue;
    const direction = delta > 0 ? 'right' : 'left';

    // Map swipe distance to rating value
    if (delta >= SWIPE.STRONGLY_AGREE_THRESHOLD) {
      rating = RATING.STRONGLY_AGREE; // +1
    } else if (delta >= SWIPE.AGREE_THRESHOLD) {
      rating = RATING.AGREE; // +0.5
    } else if (delta <= SWIPE.STRONGLY_DISAGREE_THRESHOLD) {
      rating = RATING.STRONGLY_DISAGREE; // -1
    } else if (delta <= SWIPE.DISAGREE_THRESHOLD) {
      rating = RATING.DISAGREE; // -0.5
    } else {
      return; // Don't throw if below threshold
    }

    setThrowDirection(direction);
    setIsThrowing(true);
    setIsDragging(false);
    setDragStart(null);

    playWhooshSound();

    setTimeout(() => {
      onSwipe(rating);
    }, SWIPE.SWIPE_DURATION);
  }, [onSwipe]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (dragStart === null || isThrowing) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setDragX(0);
    setDragStart(null);
    setIsDragging(false);
  }, [dragStart, isThrowing]);

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

  // Setup touch event listeners with passive: false to allow preventDefault
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (dragStart !== null) {
        e.preventDefault(); // Prevent scrolling while swiping
        const touch = e.touches[0];
        handleDragMove(touch.clientX);
      }
    };

    // Add with { passive: false } to allow preventDefault
    card.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      card.removeEventListener('touchmove', handleTouchMove);
    };
  }, [dragStart, handleDragMove]);

  // Calculate rotation based on drag or throw
  const rotation = isThrowing
    ? (throwDirection === 'right' ? 30 : -30)
    : Math.max(-30, Math.min(30, (dragX / 100) * SWIPE.ROTATION_FACTOR));

  // Show overlay during drag or throw
  const showOverlay = Math.abs(dragX) > 50 || isThrowing;
  const overlayEmoji = getOverlayEmoji(isThrowing ? throwDirection : (dragX > 0 ? 'right' : 'left'));

  // CSS classes
  const cardClasses = clsx('swipe-card', {
    'swipe-card--dragging': isDragging,
    'swipe-card--throwing': isThrowing,
    'swipe-card--entering': isEntering,
    'swipe-card--idle': !isDragging && !isThrowing && !isEntering,
    'swipe-card--like-active': showOverlay && (dragX > 0 || throwDirection === 'right'),
    'swipe-card--dislike-active': showOverlay && (dragX < 0 || throwDirection === 'left'),
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
            : `translateX(${dragX}px) rotate(${rotation}deg) scale(1)`,
        opacity: isThrowing || isEntering ? 0 : 1,
        transition: isThrowing
          ? `transform ${SWIPE.SWIPE_DURATION}ms ease-out, opacity ${SWIPE.SWIPE_DURATION}ms ease-out`
          : isEntering
            ? `transform ${SWIPE.CARD_ENTER_DURATION}ms ease-out, opacity ${SWIPE.CARD_ENTER_DURATION}ms ease-out`
            : (isDragging ? 'none' : 'transform 0.2s'),
      }}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        handleDragStart(touch.clientX, true);
      }}
      onTouchEnd={handleDragEnd}
      onTouchCancel={handleDragEnd}
      onMouseDown={(e) => {
        if (!isTouchDevice) {
          handleDragStart(e.clientX, false);
        }
      }}
      onMouseMove={(e) => {
        if (!isTouchDevice && isDragging) {
          handleDragMove(e.clientX);
        }
      }}
      onMouseUp={() => {
        if (!isTouchDevice) {
          handleDragEnd();
        }
      }}
      onMouseLeave={() => {
        if (!isTouchDevice && isDragging) {
          handleDragEnd();
        }
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
