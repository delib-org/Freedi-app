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

  // Handle no auth - show login prompt or use anonymous mode
  if (!user) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          background: 'var(--card-default)',
          borderRadius: '16px',
        }}
      >
        <h3>{t('Authentication Required')}</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          {t('Please sign in to participate in this survey.')}
        </p>
      </div>
    );
  }

  return (
    <SwipeInterface
      question={question}
      initialSolutions={initialSolutions}
      userId={user.uid}
      userName={user.displayName || 'Anonymous'}
      onComplete={onComplete}
    />
  );
};

export default SwipeInterfaceWrapper;
