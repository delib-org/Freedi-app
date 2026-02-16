/**
 * useRealtimeSignatureCounts Hook
 *
 * Real-time Firestore listener for document signature counts.
 * Counts how many users signed vs rejected a document.
 * Uses onSnapshot for instant updates.
 */

'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { Collections } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

interface SignatureCounts {
  signedCount: number;
  rejectedCount: number;
  isLoading: boolean;
}

/**
 * Hook to listen to signature counts for a document in real-time
 *
 * @param documentId - The document ID to count signatures for
 * @returns Object with signedCount, rejectedCount, and isLoading
 *
 * @example
 * const { signedCount, rejectedCount, isLoading } = useRealtimeSignatureCounts('doc_123');
 */
export function useRealtimeSignatureCounts(documentId: string): SignatureCounts {
  const [counts, setCounts] = useState<SignatureCounts>({
    signedCount: 0,
    rejectedCount: 0,
    isLoading: true,
  });

  useEffect(() => {
    if (!documentId) {
      setCounts({ signedCount: 0, rejectedCount: 0, isLoading: false });
      return;
    }

    let unsubscribe: Unsubscribe | null = null;

    try {
      const firestore = getFirebaseFirestore();

      const q = query(
        collection(firestore, Collections.signatures),
        where('documentId', '==', documentId)
      );

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          let signedCount = 0;
          let rejectedCount = 0;

          snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.signed === 'signed') {
              signedCount++;
            } else if (data.signed === 'rejected') {
              rejectedCount++;
            }
          });

          setCounts({ signedCount, rejectedCount, isLoading: false });
        },
        (error) => {
          logError(error, {
            operation: 'hooks.useRealtimeSignatureCounts',
            metadata: { documentId },
          });
          setCounts(prev => ({ ...prev, isLoading: false }));
        }
      );
    } catch (error) {
      logError(error, {
        operation: 'hooks.useRealtimeSignatureCounts.setup',
        metadata: { documentId },
      });
      setCounts(prev => ({ ...prev, isLoading: false }));
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [documentId]);

  return counts;
}
