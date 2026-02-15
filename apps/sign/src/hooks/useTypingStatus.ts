'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  QuerySnapshot,
  DocumentData,
} from 'firebase/firestore';
import { TypingStatus } from '@freedi/shared-types';
import { getFirestoreClient } from '@/lib/firebase/client';
import { logError } from '@/lib/utils/errorHandling';
import { useFirebaseAuth } from './useFirebaseAuth';

// Constants
const TYPING_COLLECTION = 'typingStatus';
const TYPING_TIMEOUT_MS = 3000; // Clear typing status after 3 seconds of inactivity
const TYPING_THROTTLE_MS = 2000; // Emit typing event max once per 2 seconds
const STALE_THRESHOLD_MS = 5000; // Consider typing status stale after 5 seconds

export interface TypingUser {
  id: string;
  displayName: string | null;
  timestamp: number;
}

interface UseTypingStatusOptions {
  paragraphId: string;
  currentUserId: string | null;
  enabled?: boolean;
}

interface UseTypingStatusReturn {
  typingUsers: TypingUser[];
  emitTyping: () => void;
  clearTyping: () => void;
}

/**
 * Hook for real-time typing status tracking.
 * Allows users to see when others are typing a suggestion.
 */
export function useTypingStatus({
  paragraphId,
  currentUserId,
  enabled = true,
}: UseTypingStatusOptions): UseTypingStatusReturn {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const lastEmitRef = useRef<number>(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef<boolean>(false);
  // Use a ref to store the clear function to avoid circular dependencies
  const clearTypingRef = useRef<() => void>(() => {});

  // Wait for Firebase Auth to be ready before setting up Firestore listeners
  const { isAuthReady, isAuthenticated } = useFirebaseAuth();

  // Generate document ID for typing status
  const getTypingDocId = useCallback((userId: string) => {
    return `${paragraphId}--${userId}`;
  }, [paragraphId]);

  // Internal function to clear typing status
  const clearTypingInternal = useCallback(() => {
    if (!currentUserId || !paragraphId) return;

    // Skip if not authenticated with Firebase
    if (!isAuthenticated) return;

    isTypingRef.current = false;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    try {
      const db = getFirestoreClient();
      const typingRef = doc(db, TYPING_COLLECTION, getTypingDocId(currentUserId));

      deleteDoc(typingRef).catch((err) => {
        // Ignore deletion errors - document may not exist
        if (err.code !== 'not-found') {
          logError(err, {
            operation: 'useTypingStatus.clearTyping',
            userId: currentUserId,
            metadata: { paragraphId },
          });
        }
      });
    } catch (err) {
      logError(err, {
        operation: 'useTypingStatus.clearTyping',
        userId: currentUserId,
        metadata: { paragraphId },
      });
    }
  }, [currentUserId, paragraphId, getTypingDocId, isAuthenticated]);

  // Keep the ref updated with the latest clear function
  useEffect(() => {
    clearTypingRef.current = clearTypingInternal;
  }, [clearTypingInternal]);

  // Emit typing status to Firestore
  const emitTyping = useCallback(() => {
    if (!currentUserId || !paragraphId || !enabled) return;

    // Skip if not authenticated with Firebase
    if (!isAuthenticated) return;

    const now = Date.now();

    // Throttle emissions
    if (now - lastEmitRef.current < TYPING_THROTTLE_MS && isTypingRef.current) {
      // Reset the auto-clear timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        clearTypingRef.current();
      }, TYPING_TIMEOUT_MS);

      return;
    }

    lastEmitRef.current = now;
    isTypingRef.current = true;

    try {
      const db = getFirestoreClient();
      const typingRef = doc(db, TYPING_COLLECTION, getTypingDocId(currentUserId));

      // Get display name from cookie
      let displayName: string | null = null;
      if (typeof window !== 'undefined') {
        const cookies = document.cookie.split(';');
        const displayNameCookie = cookies.find((c) => c.trim().startsWith('userDisplayName='));
        if (displayNameCookie) {
          displayName = decodeURIComponent(displayNameCookie.split('=')[1] || '');
        }
      }

      // Build typing status object - omit displayName if not available
      // Firestore doesn't accept undefined values
      const typingStatus: TypingStatus = {
        paragraphId,
        userId: currentUserId,
        isTyping: true,
        lastUpdate: now,
        ...(displayName ? { displayName } : {}),
      };

      console.info('[useTypingStatus] Emitting typing status:', {
        paragraphId,
        userId: currentUserId,
        displayName,
        docId: getTypingDocId(currentUserId),
      });

      setDoc(typingRef, typingStatus).then(() => {
        console.info('[useTypingStatus] Successfully wrote typing status to Firestore');
      }).catch((err) => {
        logError(err, {
          operation: 'useTypingStatus.emitTyping',
          userId: currentUserId,
          metadata: { paragraphId },
        });
      });

      // Set timeout to auto-clear typing status
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        clearTypingRef.current();
      }, TYPING_TIMEOUT_MS);
    } catch (err) {
      logError(err, {
        operation: 'useTypingStatus.emitTyping',
        userId: currentUserId,
        metadata: { paragraphId },
      });
    }
  }, [currentUserId, paragraphId, enabled, getTypingDocId, isAuthenticated]);

  // Public clear function
  const clearTyping = useCallback(() => {
    clearTypingInternal();
  }, [clearTypingInternal]);

  // Listen for typing status changes
  useEffect(() => {
    if (!enabled || !paragraphId) return;

    // Wait for Firebase Auth to be ready
    if (!isAuthReady) {
      console.info('[useTypingStatus] Waiting for auth to be ready...');

      return;
    }

    // If not authenticated, skip setting up real-time listener
    if (!isAuthenticated) {
      console.info('[useTypingStatus] Not authenticated, skipping listener');

      return;
    }

    try {
      const db = getFirestoreClient();
      const typingRef = collection(db, TYPING_COLLECTION);
      const q = query(
        typingRef,
        where('paragraphId', '==', paragraphId),
        where('isTyping', '==', true)
      );

      console.info('[useTypingStatus] Setting up listener for paragraph:', paragraphId);

      unsubscribeRef.current = onSnapshot(
        q,
        (snapshot: QuerySnapshot<DocumentData>) => {
          const now = Date.now();
          const users: TypingUser[] = [];

          console.info('[useTypingStatus] Received snapshot with', snapshot.size, 'typing users');

          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as TypingStatus;
            console.info('[useTypingStatus] Typing entry:', {
              docId: docSnap.id,
              userId: data.userId,
              displayName: data.displayName,
              isCurrentUser: data.userId === currentUserId,
              age: now - data.lastUpdate,
              isStale: now - data.lastUpdate >= STALE_THRESHOLD_MS,
            });

            // Filter out current user and stale entries
            if (data.userId !== currentUserId && now - data.lastUpdate < STALE_THRESHOLD_MS) {
              users.push({
                id: data.userId,
                displayName: data.displayName || null,
                timestamp: data.lastUpdate,
              });
            }
          });

          // Sort by most recent first
          users.sort((a, b) => b.timestamp - a.timestamp);

          console.info('[useTypingStatus] Setting typingUsers state:', users.length, 'users');
          setTypingUsers(users);
        },
        (err) => {
          logError(err, {
            operation: 'useTypingStatus.onSnapshot',
            metadata: { paragraphId },
          });
        }
      );
    } catch (err) {
      logError(err, {
        operation: 'useTypingStatus.setup',
        metadata: { paragraphId },
      });
    }

    // Cleanup
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [paragraphId, currentUserId, enabled, isAuthReady, isAuthenticated]);

  // Clear typing status on unmount or when modal closes
  useEffect(() => {
    return () => {
      clearTypingRef.current();
    };
  }, []);

  // Clear typing on visibility change (tab hidden)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isTypingRef.current) {
        clearTypingRef.current();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return {
    typingUsers,
    emitTyping,
    clearTyping,
  };
}
