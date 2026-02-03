'use client';

/**
 * SwipeInterfaceWrapper - Client wrapper for SwipeInterface
 * Handles auth and provides user context
 */

import React from 'react';
import { Statement } from '@freedi/shared-types';
import SwipeInterface from '../SwipeInterface';
import { useAuth } from '@/components/auth/AuthProvider';
import { useTranslation } from '@freedi/shared-i18n/next';

export interface SwipeInterfaceWrapperProps {
  question: Statement;
  initialSolutions: Statement[];
  onComplete?: () => void;
}

const SwipeInterfaceWrapper: React.FC<SwipeInterfaceWrapperProps> = ({
  question,
  initialSolutions,
  onComplete,
}) => {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();

  // Generate or retrieve anonymous user ID from localStorage
  const getAnonymousUserId = (): string => {
    const key = 'anonymous_user_id';
    let anonId = localStorage.getItem(key);

    if (!anonId) {
      anonId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(key, anonId);
    }

    return anonId;
  };

  // Show loading state
  if (isLoading) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          background: 'var(--card-default)',
          borderRadius: '16px',
        }}
      >
        <p>{t('Loading...')}</p>
      </div>
    );
  }

  // Use authenticated user or anonymous user ID
  const userId = user?.uid || getAnonymousUserId();
  const userName = user?.displayName || 'Anonymous';

  return (
    <SwipeInterface
      question={question}
      initialSolutions={initialSolutions}
      userId={userId}
      userName={userName}
      onComplete={onComplete}
    />
  );
};

export default SwipeInterfaceWrapper;
