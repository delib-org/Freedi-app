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
import { MergedQuestionSettings } from '@/lib/utils/settingsUtils';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';

export interface SwipeInterfaceWrapperProps {
  question: Statement;
  initialSolutions: Statement[];
  mergedSettings?: MergedQuestionSettings;
  onComplete?: () => void;
}

const SwipeInterfaceWrapper: React.FC<SwipeInterfaceWrapperProps> = ({
  question,
  initialSolutions,
  mergedSettings,
  onComplete,
}) => {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();

  // Use shared anonymous user utility for consistent ID across modes

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
  const userId = user?.uid || getOrCreateAnonymousUser();
  const userName = user?.displayName || t('Anonymous');

  return (
    <SwipeInterface
      question={question}
      initialSolutions={initialSolutions}
      userId={userId}
      userName={userName}
      mergedSettings={mergedSettings}
      onComplete={onComplete}
    />
  );
};

export default SwipeInterfaceWrapper;
