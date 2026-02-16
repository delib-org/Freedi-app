'use client';

import React, { useState, useRef } from 'react';
import SwipeCard, { SwipeCardHandle } from '@/components/prototype/SwipeCard';
import RatingButtons from '@/components/prototype/RatingButtons';

/**
 * PROTOTYPE PAGE - For UX validation only
 *
 * Purpose: Test swipe interaction on real devices
 * - Test on iOS, Android, desktop
 * - Validate swipe thresholds feel natural
 * - Check 60fps performance on mid-tier phones
 * - Determine if users prefer swipe or tap buttons
 *
 * This is throwaway code - do not refactor or over-engineer
 */

const MOCK_PROPOSALS = [
  'We should add more bike lanes throughout the city to reduce traffic congestion and promote healthier lifestyles.',
  'Create a community garden in every neighborhood to bring people together and provide fresh produce.',
  'Implement a monthly car-free Sunday where main streets are closed to vehicles and open for pedestrians.',
  'Build more affordable housing units to address the housing crisis affecting our community.',
  'Establish free WiFi in all public parks to make outdoor spaces more accessible for remote work and learning.',
  'Start a city-wide composting program to reduce waste and create nutrient-rich soil for community gardens.',
];

export default function PrototypePage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ratings, setRatings] = useState<number[]>([]);
  const [showButtons, setShowButtons] = useState(true);
  const cardRef = useRef<SwipeCardHandle>(null);

  const handleSwipe = (rating: number) => {
    console.info('Swiped with rating:', rating);
    setRatings([...ratings, rating]);
  };

  const handleNext = () => {
    if (currentIndex < MOCK_PROPOSALS.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      console.info('All proposals rated!', ratings);
    }
  };

  const handleRate = (rating: number) => {
    // Trigger throw animation on card
    if (cardRef.current) {
      cardRef.current.throwCard(rating);
    }
  };

  if (currentIndex >= MOCK_PROPOSALS.length) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>All Done! 🎉</h1>
        <p style={styles.subtitle}>
          You rated {ratings.length} proposals
        </p>
        <div style={styles.stats}>
          <p>Ratings: {ratings.join(', ')}</p>
        </div>
        <button
          onClick={() => {
            setCurrentIndex(0);
            setRatings([]);
          }}
          style={styles.resetButton}
        >
          Start Over
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Instructions */}
      <div style={styles.header}>
        <h1 style={styles.title}>Swipe Prototype</h1>
        <p style={styles.subtitle}>
          Swipe left to disagree, right to agree
        </p>
        <p style={styles.counter}>
          {currentIndex + 1} of {MOCK_PROPOSALS.length}
        </p>
      </div>

      {/* Swipe Card */}
      <div style={styles.cardContainer}>
        <SwipeCard
          ref={cardRef}
          text={MOCK_PROPOSALS[currentIndex]}
          onSwipe={handleSwipe}
          onNext={handleNext}
        />
      </div>

      {/* Rating Buttons (alternative to swipe) */}
      <div style={styles.buttonContainer}>
        <label style={styles.toggle}>
          <input
            type="checkbox"
            checked={showButtons}
            onChange={(e) => setShowButtons(e.target.checked)}
          />
          <span style={{ marginLeft: '0.5rem' }}>Show tap buttons</span>
        </label>
        {showButtons && <RatingButtons onRate={handleRate} />}
      </div>

      {/* Debug info */}
      <div style={styles.debug}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Test on: iOS • Android • Desktop<br />
          Check: Smooth 60fps • Natural thresholds • Touch targets
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'clamp(0.5rem, 2vw, 1.5rem)',
    gap: 'clamp(0.5rem, 2vh, 1rem)',
    overflow: 'hidden',
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    touchAction: 'none',
  },
  header: {
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  title: {
    fontSize: 'clamp(1.125rem, 4vw, 1.5rem)',
    fontWeight: 600,
    marginBottom: '0.25rem',
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: 'clamp(0.875rem, 3vw, 1rem)',
    color: 'var(--text-secondary)',
  },
  counter: {
    fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)',
    color: 'var(--text-secondary)',
    marginTop: '0.25rem',
  },
  cardContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    flex: '1 1 auto',
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative' as const,
  },
  buttonContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 'clamp(0.5rem, 2vh, 1rem)',
    touchAction: 'auto',
    width: '100%',
    flexShrink: 0,
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)',
    cursor: 'pointer',
  },
  debug: {
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  stats: {
    marginTop: '1rem',
    padding: '1rem',
    background: 'var(--card-default)',
    borderRadius: '8px',
  },
  resetButton: {
    marginTop: '1rem',
    padding: '0.75rem 1.5rem',
    background: 'var(--btn-primary)',
    color: 'white',
    border: 'none',
    borderRadius: '24px',
    fontSize: '1rem',
    cursor: 'pointer',
  },
};
