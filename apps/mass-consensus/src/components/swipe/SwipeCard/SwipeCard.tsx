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
import { createPortal } from 'react-dom';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import clsx from 'clsx';
import { SWIPE, RATING_CONFIG, RATING, ZONES, ZONE_CONFIG } from '@/constants/common';
import { playWhooshSound } from './soundEffects';
import type { RatingValue } from '../RatingButton';
import RatingIcon from '@/components/icons/RatingIcon';

export interface SwipeCardProps {
  statement: Statement;
  onSwipe: (rating: RatingValue) => void | Promise<void>;
  totalCards: number;
  currentIndex: number;
  programmaticThrow?: { rating: RatingValue; direction: 'left' | 'right' } | null;
  onCommentClick?: () => void;
}

// Calculate initial zone from touch/click position
function calculateInitialZone(clientX: number, cardElement: HTMLDivElement | null): number | null {
  if (!cardElement) return null;
  const rect = cardElement.getBoundingClientRect();
  const zoneWidth = rect.width / ZONES.TOTAL_ZONES;
  const offsetX = clientX - rect.left;
  let zoneIndex = Math.floor(offsetX / zoneWidth);
  zoneIndex = Math.max(0, Math.min(ZONES.TOTAL_ZONES - 1, zoneIndex));

  // Universal layout: zone 0 (red) on left, zone 4 (green) on right
  // Visual position directly maps to zone index
  return zoneIndex;
}

// Check if vertical swipe meets threshold
function isVerticalSwipeComplete(dragY: number): boolean {
  return dragY <= -ZONES.VERTICAL_SWIPE_THRESHOLD; // Negative = upward
}

export default function SwipeCard({
  statement,
  onSwipe,
  totalCards,
  currentIndex,
  programmaticThrow,
  onCommentClick,
}: SwipeCardProps) {
  const { t, tWithParams } = useTranslation();

  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isThrowing, setIsThrowing] = useState(false);
  const [throwDirection, setThrowDirection] = useState<'left' | 'right' | 'up' | null>(
    null
  );
  const [isEntering, setIsEntering] = useState(true);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Synchronous ref guard to prevent double-fires within the same render cycle
  const isThrowingRef = useRef(false);

  // Zone tracking
  const [, setCurrentZone] = useState<number | null>(null);
  const [dragStartZone, setDragStartZone] = useState<number | null>(null);
  const [isVerticalDrag, setIsVerticalDrag] = useState(false);
  const [highlightedZone, setHighlightedZone] = useState<number | null>(null);

  // Vertical tracking
  const [dragY, setDragY] = useState(0);
  const [dragStartY, setDragStartY] = useState<number | null>(null);

  // Confirmation for first few swipes (learning mode)
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingRating, setPendingRating] = useState<RatingValue | null>(null);
  const [pendingDirection, setPendingDirection] = useState<'left' | 'right' | 'up' | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Show confirmation for first 3 evaluations
  const LEARNING_MODE_COUNT = 3;
  const isLearningMode = currentIndex < LEARNING_MODE_COUNT;

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
    setDragY(0);
    setDragStart(null);
    setDragStartY(null);
    setIsDragging(false);
    setIsThrowing(false);
    isThrowingRef.current = false;
    setThrowDirection(null);
    setIsEntering(true);
    setCurrentZone(null);
    setDragStartZone(null);
    setIsVerticalDrag(false);
    setHighlightedZone(null);

    const timer = setTimeout(() => {
      setIsEntering(false);
    }, SWIPE.CARD_ENTER_DURATION);

    return () => clearTimeout(timer);
  }, [statement.statementId]);

  // Handle drag start (touch/mouse)
  const handleDragStart = useCallback((clientX: number, clientY: number, isTouch: boolean) => {
    if (isThrowing || isThrowingRef.current || isEntering) return;
    setIsTouchDevice(isTouch);
    setDragStart(clientX);
    setDragStartY(clientY);
    setIsDragging(true);

    // Calculate starting zone
    const initialZone = calculateInitialZone(clientX, cardRef.current);
    setDragStartZone(initialZone);
    setCurrentZone(initialZone); // Set current zone immediately
    setHighlightedZone(initialZone); // Show emoji on touched zone immediately

    // Check if center zone (special vertical-only behavior)
    if (initialZone === ZONES.CENTER_ZONE_INDEX) {
      setIsVerticalDrag(true);
    } else {
      setIsVerticalDrag(false);
    }
  }, [isThrowing, isEntering]);

  // Handle drag move
  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (dragStart === null || dragStartY === null || isThrowing || dragStartZone === null) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      if (isVerticalDrag) {
        // CENTER ZONE: Vertical only (upward)
        const deltaY = clientY - dragStartY;
        // Only allow upward movement (negative deltaY)
        setDragY(Math.min(0, deltaY));
        setDragX(0); // Lock horizontal
      } else {
        // NORMAL: Horizontal drag with directional lock
        const deltaX = clientX - dragStart;

        // Universal directional lock based on zone position
        if (dragStartZone < ZONES.CENTER_ZONE_INDEX) {
          // Negative zones (0, 1 - left side) - only allow leftward movement
          setDragX(Math.min(0, deltaX));
        } else if (dragStartZone > ZONES.CENTER_ZONE_INDEX) {
          // Positive zones (3, 4 - right side) - only allow rightward movement
          setDragX(Math.max(0, deltaX));
        } else {
          // Center zone shouldn't reach here (isVerticalDrag handles it)
          setDragX(0);
        }
      }
    });
  }, [dragStart, dragStartY, dragStartZone, isThrowing, isVerticalDrag]);

  // Reset drag state helper
  const resetDragState = useCallback(() => {
    setDragX(0);
    setDragY(0);
    setDragStart(null);
    setDragStartY(null);
    setIsDragging(false);
    setCurrentZone(null);
    setHighlightedZone(null);
    setDragStartZone(null);
    setIsVerticalDrag(false);
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (dragStart === null || isThrowing || isThrowingRef.current) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (isVerticalDrag) {
      // CENTER ZONE: Check vertical threshold
      if (isVerticalSwipeComplete(dragY)) {
        const rating = RATING.NEUTRAL;

        if (isLearningMode) {
          // Show confirmation in learning mode
          setPendingRating(rating);
          setPendingDirection('up');
          setShowConfirmation(true);
          resetDragState(); // Reset card position while showing confirmation
        } else {
          // Direct throw without confirmation
          isThrowingRef.current = true;
          setIsThrowing(true);
          setThrowDirection('up');
          playWhooshSound();
          setTimeout(() => onSwipe(rating), SWIPE.SWIPE_DURATION);
        }
      } else {
        resetDragState(); // Insufficient swipe
      }
    } else {
      // NORMAL: Check if horizontal drag meets minimum threshold
      const dragDistance = Math.abs(dragX);

      if (dragDistance >= ZONES.HORIZONTAL_SWIPE_THRESHOLD && dragStartZone !== null) {
        // Sufficient horizontal swipe - evaluate rating using the initially grabbed zone
        const config = ZONE_CONFIG[dragStartZone];
        const rating = config.rating;
        // Negative zones (0, 1 - left side) throw left, positive zones (3, 4 - right side) throw right
        const direction = dragStartZone < ZONES.CENTER_ZONE_INDEX ? 'left' : 'right';

        if (isLearningMode) {
          // Show confirmation in learning mode
          setPendingRating(rating);
          setPendingDirection(direction);
          setShowConfirmation(true);
          resetDragState(); // Reset card position while showing confirmation
        } else {
          // Direct throw without confirmation
          isThrowingRef.current = true;
          setIsThrowing(true);
          setThrowDirection(direction);
          playWhooshSound();
          setTimeout(() => onSwipe(rating), SWIPE.SWIPE_DURATION);
        }
      } else {
        // Insufficient swipe - return card to center
        resetDragState();
      }
    }
  }, [dragStart, dragY, dragX, dragStartZone, isVerticalDrag, isThrowing, onSwipe, resetDragState, isLearningMode]);

  // Handle confirmation - user confirms their rating
  const handleConfirm = useCallback(() => {
    if (pendingRating === null || pendingDirection === null) return;

    setShowConfirmation(false);
    isThrowingRef.current = true;
    setIsThrowing(true);
    setThrowDirection(pendingDirection);
    playWhooshSound();
    setTimeout(() => {
      onSwipe(pendingRating);
      setPendingRating(null);
      setPendingDirection(null);
    }, SWIPE.SWIPE_DURATION);
  }, [pendingRating, pendingDirection, onSwipe]);

  // Handle cancel - user wants to change their mind
  const handleCancel = useCallback(() => {
    setShowConfirmation(false);
    setPendingRating(null);
    setPendingDirection(null);
    // Card already reset by resetDragState in handleDragEnd
  }, []);

  // Handle programmatic throw (from button clicks)
  useEffect(() => {
    if (programmaticThrow && !isThrowing && !isThrowingRef.current && !isEntering) {
      const { rating, direction } = programmaticThrow;

      isThrowingRef.current = true;
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
      if (dragStart !== null && dragStartY !== null) {
        e.preventDefault(); // Prevent scrolling while swiping
        const touch = e.touches[0];
        handleDragMove(touch.clientX, touch.clientY);
      }
    };

    // Add with { passive: false } to allow preventDefault
    card.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      card.removeEventListener('touchmove', handleTouchMove);
    };
  }, [dragStart, dragStartY, handleDragMove]);

  // Calculate rotation based on drag or throw
  const rotation = isThrowing
    ? (throwDirection === 'right' ? 30 : throwDirection === 'left' ? -30 : 0)
    : Math.max(-30, Math.min(30, (dragX / 100) * SWIPE.ROTATION_FACTOR));

  // CSS classes
  const cardClasses = clsx('swipe-card', {
    'swipe-card--dragging': isDragging,
    'swipe-card--throwing': isThrowing,
    'swipe-card--entering': isEntering,
    'swipe-card--idle': !isDragging && !isThrowing && !isEntering,
    'swipe-card--vertical-drag': isVerticalDrag,
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
          ? (throwDirection === 'up'
              ? `translateY(-1000px) rotate(0deg) scale(0.8)`
              : `translateX(${throwDirection === 'right' ? 1000 : -1000}px) rotate(${rotation}deg) scale(1)`)
          : isEntering
            ? `translateX(0) rotate(0) scale(0.8)`
            : isVerticalDrag
              ? `translateY(${dragY}px) rotate(0deg) scale(1)`
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
        handleDragStart(touch.clientX, touch.clientY, true);
      }}
      onTouchEnd={handleDragEnd}
      onTouchCancel={handleDragEnd}
      onMouseDown={(e) => {
        if (!isTouchDevice) {
          handleDragStart(e.clientX, e.clientY, false);
        }
      }}
      onMouseMove={(e) => {
        if (!isTouchDevice && isDragging) {
          handleDragMove(e.clientX, e.clientY);
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
      {/* Zone strips (always visible) */}
      <div className="swipe-card__zones">
        {ZONE_CONFIG.map((zone) => (
          <div
            key={zone.index}
            className={clsx(
              'swipe-card__zone',
              `swipe-card__zone--zone-${zone.index}`,
              highlightedZone === zone.index && 'swipe-card__zone--active'
            )}
            aria-hidden="true"
          >
            <span className="swipe-card__zone-emoji"><RatingIcon rating={zone.rating} /></span>
          </div>
        ))}
      </div>

      {/* Suggestion number badge */}
      <div className="swipe-card__number">
        #{currentIndex + 1}
      </div>

      {/* Content wrapper (above zones) */}
      <div className="swipe-card__content-wrapper">
        <div className="swipe-card__content">{statement.statement}</div>
      </div>

      {/* Vertical indicator for center zone */}
      {isVerticalDrag && (
        <div className="swipe-card__vertical-indicator">↑</div>
      )}

      {/* Comment button */}
      {onCommentClick && !isThrowing && !isEntering && (
        <button
          className="swipe-card__comment-btn"
          type="button"
          onClick={(e) => { e.stopPropagation(); onCommentClick(); }}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label={t('Add comment')}
        >
          💬
        </button>
      )}

      {/* Screen reader announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {currentIndex + 1} {t('of')} {totalCards}
      </div>

      {/* Confirmation modal for learning mode - rendered via portal to escape card transforms */}
      {showConfirmation && pendingRating !== null && createPortal(
        <div className="swipe-card__confirmation-overlay">
          <div
            className={clsx(
              'swipe-card__confirmation-modal',
              `swipe-card__confirmation-modal--${RATING_CONFIG[pendingRating].variant}`
            )}
          >
            <div className="swipe-card__confirmation-emoji">
              <RatingIcon rating={pendingRating} />
            </div>
            <h3 className="swipe-card__confirmation-title">
              {t('You have rated it as')}
            </h3>
            <p className="swipe-card__confirmation-rating">
              {t(RATING_CONFIG[pendingRating].labelKey)}
            </p>
            <p className="swipe-card__confirmation-question" dir="auto">
              {t('Are you sure?')}
            </p>
            <div className="swipe-card__confirmation-buttons">
              <button
                className="swipe-card__confirmation-button swipe-card__confirmation-button--cancel"
                onClick={handleCancel}
                type="button"
              >
                {t('No, go back')}
              </button>
              <button
                className="swipe-card__confirmation-button swipe-card__confirmation-button--confirm"
                onClick={handleConfirm}
                type="button"
              >
                {t('Yes, confirm')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
