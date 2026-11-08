'use client';

import { useEffect, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { useAuth } from '@/components/auth/AuthProvider';
import { fetchCanEditCardImage } from '@/controllers/cardImageController';
import { NotAuthenticatedError } from '@/lib/api/authedFetch';
import { logError } from '@/lib/utils/errorHandling';

/**
 * Whether the signed-in user may change the pictures on this question's cards.
 *
 * Admin rights belong to the question, not the option, so the server is asked
 * once per question (through whichever card is showing) and the answer holds
 * for every card after it. Anonymous visitors are never admins and never ask.
 * False until the answer arrives, so the button never flashes in for someone
 * who turns out not to have it.
 */
export function useCanEditCardImage(card: Statement | null, surveyId?: string): boolean {
  const { user } = useAuth();
  const [answers, setAnswers] = useState<Record<string, boolean>>({});

  const signedInUid = user && !user.isAnonymous ? user.uid : null;
  const questionId = card?.parentId;
  const key = signedInUid && questionId ? `${signedInUid}:${questionId}:${surveyId ?? ''}` : null;
  const known = key !== null && key in answers;
  const cardId = card?.statementId;

  useEffect(() => {
    if (!key || known || !cardId) return;

    let cancelled = false;
    fetchCanEditCardImage(cardId, surveyId)
      .then((canEdit) => {
        if (!cancelled) setAnswers((prev) => ({ ...prev, [key]: canEdit }));
      })
      .catch((error: unknown) => {
        if (!(error instanceof NotAuthenticatedError)) {
          logError(error, {
            operation: 'useCanEditCardImage',
            statementId: cardId,
            metadata: { surveyId },
          });
        }
        if (!cancelled) setAnswers((prev) => ({ ...prev, [key]: false }));
      });

    return () => {
      cancelled = true;
    };
  }, [key, known, cardId, surveyId]);

  return key !== null && answers[key] === true;
}
