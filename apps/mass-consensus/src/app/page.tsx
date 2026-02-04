'use client';

import React, { useState } from 'react';
import SwipeCard from '@/components/swipe/SwipeCard';
import { Statement } from '@freedi/shared-types';

export default function Home() {
  const [ratings, setRatings] = useState<number[]>([]);

  // Mock statement for testing
  const mockStatement: Statement = {
    statementId: 'test-1',
    statement: 'Should we implement universal basic income?',
    creatorId: 'user-1',
    creator: {
      displayName: 'Test User',
      photoURL: 'https://via.placeholder.com/32',
    },
    statementType: 'question' as const,
    parentId: 'root',
    topParentId: 'root',
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    hasChildren: false,
    allowAnonymousLogin: false,
  };

  const handleSwipe = (rating: number) => {
    setRatings([...ratings, rating]);
    console.log('Swiped with rating:', rating);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      gap: '2rem',
    }}>
      <h1 style={{ color: '#334155', marginBottom: '1rem' }}>
        Zone-Based Swipe Test
      </h1>

      <p style={{ color: '#475569', textAlign: 'center', maxWidth: '600px' }}>
        Drag the card to see the zone-based rating system in action:
        <br />
        • Drag horizontally on left/right zones for ratings
        <br />
        • Drag vertically upward from center (yellow) zone for neutral rating
      </p>

      <SwipeCard
        statement={mockStatement}
        onSwipe={handleSwipe}
        totalCards={1}
        currentIndex={0}
      />

      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
      }}>
        <h3 style={{ color: '#334155', marginBottom: '0.5rem' }}>Ratings History:</h3>
        {ratings.length === 0 ? (
          <p style={{ color: '#64748b' }}>No ratings yet. Try swiping!</p>
        ) : (
          <ul style={{ color: '#475569' }}>
            {ratings.map((rating, i) => (
              <li key={i}>
                Rating {i + 1}: {rating}
                {rating === 1 && ' (Strongly Agree 🎉)'}
                {rating === 0.5 && ' (Agree 👍)'}
                {rating === 0 && ' (Neutral ↑)'}
                {rating === -0.5 && ' (Disagree 👎)'}
                {rating === -1 && ' (Strongly Disagree 🚫)'}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
