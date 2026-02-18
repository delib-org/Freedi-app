/**
 * useRealtimeSignatureCounts Hook
 *
 * Real-time Firestore listener for document signature counts.
 * Counts how many users signed vs rejected a document.
 * Waits for Firebase Auth to be ready before subscribing to avoid permission errors.
 */

'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseFirestore, getFirebaseAuth } from '@/lib/firebase/client';
import { Collections } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

interface SignatureCounts {
  signedCount: number;
  rejectedCount: number;
  isLoading: boolean;
}

/**
 * Hook to listen to signature counts for a document in real-time
 * Waits for Firebase Auth to be initialized before subscribing
 *
 * @param documentId - The document ID to count signatures for
 * @returns Object with signedCount, rejectedCount, and isLoading
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

    let snapshotUnsubscribe: Unsubscribe | null = null;

    // Wait for auth to be ready before setting up the Firestore listener
    const auth = getFirebaseAuth();
    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      // Clean up any previous snapshot listener
      if (snapshotUnsubscribe) {
        snapshotUnsubscribe();
        snapshotUnsubscribe = null;
      }

      if (!user) {
        // Not authenticated yet - keep loading
        return;
      }

      // Auth is ready - set up the Firestore listener
      try {
        const firestore = getFirebaseFirestore();

        const q = query(
          collection(firestore, Collections.signatures),
          where('documentId', '==', documentId)
        );

        snapshotUnsubscribe = onSnapshot(
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
            setCounts((prev) => ({ ...prev, isLoading: false }));
          }
        );
      } catch (error) {
        logError(error, {
          operation: 'hooks.useRealtimeSignatureCounts.setup',
          metadata: { documentId },
        });
        setCounts((prev) => ({ ...prev, isLoading: false }));
      }
    });

    return () => {
      authUnsubscribe();
      if (snapshotUnsubscribe) {
        snapshotUnsubscribe();
      }
    };
  }, [documentId]);

  return counts;
}
