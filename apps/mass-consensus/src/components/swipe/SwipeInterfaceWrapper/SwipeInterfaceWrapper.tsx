'use client';

/**
 * SwipeInterfaceWrapper - Client wrapper for SwipeInterface
 * Handles auth and provides user context
 */

import React, { useEffect, useRef } from 'react';
import { Statement } from '@freedi/shared-types';
import SwipeInterface from '../SwipeInterface';
import { useAuth } from '@/components/auth/AuthProvider';
import { useTranslation } from '@freedi/shared-i18n/next';
import { MergedQuestionSettings } from '@/lib/utils/settingsUtils';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import { pingSurveyEntry } from '@/lib/utils/surveyEntryPing';

export interface SwipeInterfaceWrapperProps {
  question: Statement;
  initialSolutions: Statement[];
  mergedSettings?: MergedQuestionSettings;
  onComplete?: () => void;
  /** Survey context: used to stamp evaluations with a demographic anchor */
  surveyId?: string;
}

const SwipeInterfaceWrapper: React.FC<SwipeInterfaceWrapperProps> = ({
  question,
  initialSolutions,
  mergedSettings,
  onComplete,
  surveyId,
}) => {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();

  // Record that this user entered the question (fire-and-forget,
  // once per mount; the API is idempotent per user+question).
  const viewRecordedRef = useRef(false);
  useEffect(() => {
    if (isLoading || viewRecordedRef.current) return;
    viewRecordedRef.current = true;

    const viewerId = user?.uid || getOrCreateAnonymousUser();
    fetch(`/api/statements/${question.statementId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: viewerId }),
    }).catch(() => {
      // Non-blocking: view tracking must never disturb the flow
    });

    if (surveyId) {
      pingSurveyEntry(surveyId, viewerId);
    }
  }, [isLoading, user?.uid, question.statementId, surveyId]);

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
      surveyId={surveyId}
    />
  );
};

export default SwipeInterfaceWrapper;
