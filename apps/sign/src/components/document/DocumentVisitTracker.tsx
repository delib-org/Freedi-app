'use client';

import { useEffect } from 'react';

interface DocumentVisitTrackerProps {
  statementId: string;
}

/**
 * Invisible client component that marks a document as visited
 * in the user's subscriptions, so it appears on their home page.
 */
export default function DocumentVisitTracker({ statementId }: DocumentVisitTrackerProps) {
  useEffect(() => {
    fetch('/api/documents/mark-visited', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statementId }),
    }).catch(() => {
      // Silent fail - this is a non-critical background operation
    });
  }, [statementId]);

  return null;
}
