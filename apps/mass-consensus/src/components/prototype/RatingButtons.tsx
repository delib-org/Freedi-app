'use client';

import React, { useState, useEffect } from 'react';
import { RATING } from '@/constants/common';
import { playClickSound } from './soundEffects';

interface RatingButtonsProps {
  onRate: (rating: number) => void;
}

const RATINGS = [
  { value: RATING.HATE, emoji: '❌', label: 'Strongly dislike', color: 'var(--rating-hate)' },
  { value: RATING.DISLIKE, emoji: '👎', label: 'Dislike', color: 'var(--rating-dislike)' },
  { value: RATING.NEUTRAL, emoji: '😐', label: 'Neutral', color: 'var(--rating-neutral)' },
  { value: RATING.LIKE, emoji: '👍', label: 'Like', color: 'var(--rating-like)' },
  { value: RATING.LOVE, emoji: '❤️', label: 'Love it', color: 'var(--rating-love)' },
];

/**
 * PROTOTYPE COMPONENT - For UX validation only
 * Tap alternative to swipe interaction
 * Mobile: Shows emoji only, Desktop: Shows emoji + label
 */
export default function RatingButtons({ onRate }: RatingButtonsProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        justifyContent: 'center',
        flexWrap: 'wrap',
        marginTop: '1rem',
        width: '100%',
      }}
    >
      {RATINGS.map((rating) => (
        <button
          key={rating.value}
          onClick={() => {
            playClickSound();
            onRate(rating.value);
          }}
          aria-label={rating.label}
          style={{
            padding: isMobile ? '0.75rem' : '0.75rem 1rem',
            border: 'none',
            borderRadius: isMobile ? '50%' : '24px',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isMobile ? '0' : '0.5rem',
            minWidth: '44px',
            minHeight: '44px',
            background: rating.color,
            flexShrink: 0,
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <span style={{ fontSize: isMobile ? '1.5rem' : '1.25rem' }}>
            {rating.emoji}
          </span>
          {!isMobile && <span>{rating.label}</span>}
        </button>
      ))}
    </div>
  );
}
