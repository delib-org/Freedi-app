'use client';

import React, {
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { SWIPE, RATING, RATING_CONFIG } from '@/constants/common';
import { playWhooshSound } from './soundEffects';

interface SwipeCardProps {
  text: string;
  onSwipe: (rating: number) => void;
  onNext: () => void;
}

export interface SwipeCardHandle {
  throwCard: (rating: number) => void;
}

/**
 * PROTOTYPE COMPONENT - For UX validation only
 * This is throwaway code to test swipe interaction feel
 *
 * NOTE: Manual swiping is still enabled in this prototype for testing.
 * The production SwipeCard has manual swiping disabled.
 */
const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(
  ({ text, onSwipe, onNext }, ref) => {
    const [dragStart, setDragStart] = useState<number | null>(null);
    const [dragX, setDragX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isThrowing, setIsThrowing] = useState(false);
    const [throwDirection, setThrowDirection] = useState<
      'left' | 'right' | null
    >(null);
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

    const [isEntering, setIsEntering] = useState(true);

    // Reset state when text changes (new card)
    useEffect(() => {
      setDragX(0);
      setDragStart(null);
      setIsDragging(false);
      setIsThrowing(false);
      setThrowDirection(null);
      setIsEntering(true);

      // End entering animation after duration
      const timer = setTimeout(() => {
        setIsEntering(false);
      }, SWIPE.CARD_ENTER_DURATION);

      return () => clearTimeout(timer);
    }, [text]);

    // Expose throwCard method to parent
    useImperativeHandle(ref, () => ({
      throwCard: (rating: number) => {
        // Get direction from RATING_CONFIG
        const config = RATING_CONFIG[rating as keyof typeof RATING_CONFIG];
        const direction = config?.direction || (rating > 0 ? 'right' : 'left');
        setThrowDirection(direction);
        setIsThrowing(true);

        // Play whoosh sound
        playWhooshSound();

        setTimeout(() => {
          onSwipe(rating);
          onNext();
        }, SWIPE.SWIPE_DURATION);
      },
    }));

    const handleDragStart = (clientX: number, isTouch: boolean) => {
      if (isThrowing || isEntering) return;
      console.info('Drag start:', clientX, 'isTouch:', isTouch);
      setIsTouchDevice(isTouch);
      setDragStart(clientX);
      setIsDragging(true);
    };

    const handleDragMove = (clientX: number) => {
      if (dragStart === null || isThrowing) return;

      // Use RAF for smooth animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        const delta = clientX - dragStart;
        setDragX(delta);

        // Auto-throw when threshold reached during drag
        if (Math.abs(delta) >= SWIPE.LIKE_THRESHOLD && !isThrowing) {
          handleAutoThrow(delta);
        }
      });
    };

    const handleAutoThrow = (delta: number) => {
      console.info('Auto throw triggered with delta:', delta);

      // Clean up RAF
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Determine rating based on new scale
      let rating: number;
      const direction = delta > 0 ? 'right' : 'left';

      // Map swipe distance to new rating scale (-1 to +1)
      if (delta >= SWIPE.LOVE_THRESHOLD) {
        rating = RATING.STRONGLY_AGREE; // +1
      } else if (delta >= SWIPE.LIKE_THRESHOLD) {
        rating = RATING.AGREE; // +0.5
      } else if (delta <= SWIPE.HATE_THRESHOLD) {
        rating = RATING.STRONGLY_DISAGREE; // -1
      } else if (delta <= SWIPE.DISLIKE_THRESHOLD) {
        rating = RATING.DISAGREE; // -0.5
      } else {
        return; // Shouldn't happen
      }

      console.info(
        'Throwing card with rating:',
        rating,
        'direction:',
        direction
      );

      setThrowDirection(direction);
      setIsThrowing(true);
      setIsDragging(false);
      setDragStart(null);

      // Play whoosh sound
      playWhooshSound();

      setTimeout(() => {
        onSwipe(rating);
        onNext();
      }, SWIPE.SWIPE_DURATION);
    };

    const handleDragEnd = () => {
      if (dragStart === null || isThrowing) return;

      // Clean up RAF
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // If not thrown, reset
      setDragX(0);
      setDragStart(null);
      setIsDragging(false);
    };

    // Calculate rotation based on drag (clamped for realism)
    const rotation = isThrowing
      ? throwDirection === 'right'
        ? 30
        : -30
      : Math.max(-30, Math.min(30, (dragX / 100) * SWIPE.ROTATION_FACTOR));

    // Calculate transform for throwing and entering animations
    const getTransform = () => {
      if (isThrowing) {
        const throwDistance = throwDirection === 'right' ? 1000 : -1000;
        return `translateX(${throwDistance}px) rotate(${rotation}deg) scale(1)`;
      }
      if (isEntering) {
        return `translateX(0) rotate(0) scale(0.8)`;
      }
      return `translateX(${dragX}px) rotate(${rotation}deg) scale(1)`;
    };

    const getOpacity = () => {
      if (isThrowing) return 0;
      if (isEntering) return 0;
      return 1;
    };

    // Show emoji overlay
    const showOverlay = Math.abs(dragX) > 50 || isThrowing;
    const overlayEmoji =
      (isThrowing ? throwDirection === 'right' : dragX > 0)
        ? RATING_CONFIG[RATING.STRONGLY_AGREE].emoji
        : RATING_CONFIG[RATING.STRONGLY_DISAGREE].emoji;
    const overlayOpacity = isThrowing ? 1 : Math.min(Math.abs(dragX) / 200, 1);

    return (
      <div
        ref={cardRef}
        style={{
          position: 'relative',
          width: '90%',
          maxWidth: '400px',
          height: 'clamp(300px, 50vh, 500px)',
          maxHeight: '60vh',
          background: 'var(--card-default)',
          borderRadius: '16px',
          padding: 'clamp(1rem, 4vw, 1.5rem)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'none',
          userSelect: 'none',
          cursor: isDragging ? 'grabbing' : 'grab',
          transform: getTransform(),
          opacity: getOpacity(),
          transition: isThrowing
            ? `transform ${SWIPE.SWIPE_DURATION}ms ease-out, opacity ${SWIPE.SWIPE_DURATION}ms ease-out`
            : isEntering
              ? `transform ${SWIPE.CARD_ENTER_DURATION}ms ease-out, opacity ${SWIPE.CARD_ENTER_DURATION}ms ease-out`
              : isDragging
                ? 'none'
                : 'transform 0.2s',
          willChange:
            isDragging || isThrowing || isEntering
              ? 'transform, opacity'
              : 'auto',
        }}
        // Touch events (mobile)
        onTouchStart={(e) => {
          const touch = e.touches[0];
          handleDragStart(touch.clientX, true);
        }}
        onTouchMove={(e) => {
          e.preventDefault(); // Prevent scrolling while swiping
          const touch = e.touches[0];
          handleDragMove(touch.clientX);
        }}
        onTouchEnd={() => {
          handleDragEnd();
        }}
        onTouchCancel={() => {
          handleDragEnd();
        }}
        // Mouse events (desktop)
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
        {/* Overlay emoji */}
        {showOverlay && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '4rem',
              opacity: overlayOpacity,
              pointerEvents: 'none',
            }}
          >
            {overlayEmoji}
          </div>
        )}

        {/* Card content */}
        <p
          style={{
            fontSize: '1.125rem',
            lineHeight: '1.6',
            color: 'var(--text-body)',
            textAlign: 'center',
          }}
        >
          {text}
        </p>
      </div>
    );
  }
);

SwipeCard.displayName = 'SwipeCard';

export default SwipeCard;
