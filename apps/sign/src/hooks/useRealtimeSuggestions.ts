'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
  QuerySnapshot,
  DocumentData,
} from 'firebase/firestore';
import { Suggestion } from '@freedi/shared-types';
import { getFirestoreClient } from '@/lib/firebase/client';
import { logError } from '@/lib/utils/errorHandling';
import { QUERY_LIMITS, API_ROUTES, SUGGESTIONS } from '@/constants/common';
import { useFirebaseAuth } from './useFirebaseAuth';
import { useUIStore } from '@/store/uiStore';

interface UseRealtimeSuggestionsOptions {
  paragraphId: string;
  enabled?: boolean;
}

interface UseRealtimeSuggestionsReturn {
  suggestions: Suggestion[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook for real-time Firestore listener on suggestions for a paragraph.
 * Falls back to polling if real-time connection fails or auth is not ready.
 */
export function useRealtimeSuggestions({
  paragraphId,
  enabled = true,
}: UseRealtimeSuggestionsOptions): UseRealtimeSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [usePollingFallback, setUsePollingFallback] = useState(false);

  // Wait for Firebase Auth to be ready before setting up Firestore listeners
  const { isAuthReady, isAuthenticated } = useFirebaseAuth();

  // Polling fallback function
  const fetchSuggestions = useCallback(async () => {
    try {
      const response = await fetch(API_ROUTES.SUGGESTIONS(paragraphId));
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (err) {
      logError(err, {
        operation: 'useRealtimeSuggestions.polling',
        metadata: { paragraphId },
      });
    } finally {
      setIsLoading(false);
    }
  }, [paragraphId]);

  // Real-time listener effect
  useEffect(() => {
    if (!enabled || !paragraphId) {
      setIsLoading(false);

      return;
    }

    // Wait for Firebase Auth to be ready
    if (!isAuthReady) {
      console.info('[RealtimeSuggestions] Waiting for auth to be ready...');

      return;
    }

    // If not authenticated, use polling fallback (API route handles auth differently)
    if (!isAuthenticated) {
      console.info('[RealtimeSuggestions] Not authenticated, using polling fallback');
      setUsePollingFallback(true);

      return;
    }

    // If using polling fallback, don't set up real-time listener
    if (usePollingFallback) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const db = getFirestoreClient();
      console.info('[RealtimeSuggestions] Setting up listener for paragraph:', paragraphId, 'auth ready:', isAuthReady);

      const suggestionsRef = collection(db, 'suggestions');
      const q = query(
        suggestionsRef,
        where('paragraphId', '==', paragraphId),
        where('hide', '==', false),
        orderBy('createdAt', 'desc'),
        limit(QUERY_LIMITS.SUGGESTIONS)
      );

      // Set up real-time listener
      unsubscribeRef.current = onSnapshot(
        q,
        (snapshot: QuerySnapshot<DocumentData>) => {
          console.info('[RealtimeSuggestions] Received update:', snapshot.size, 'suggestions');
          const suggestionsData: Suggestion[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            const suggestion = {
              suggestionId: data.suggestionId,
              paragraphId: data.paragraphId,
              documentId: data.documentId,
              topParentId: data.topParentId,
              originalContent: data.originalContent,
              suggestedContent: data.suggestedContent,
              reasoning: data.reasoning,
              creatorId: data.creatorId,
              creatorDisplayName: data.creatorDisplayName,
              createdAt: data.createdAt,
              lastUpdate: data.lastUpdate,
              consensus: data.consensus,
              hide: data.hide,
            } as Suggestion;
            console.info('[RealtimeSuggestions] Suggestion data:', {
              id: suggestion.suggestionId,
              creator: suggestion.creatorDisplayName,
              content: suggestion.suggestedContent?.substring(0, 50) + '...',
            });
            suggestionsData.push(suggestion);
          });
          console.info('[RealtimeSuggestions] Setting state with', suggestionsData.length, 'suggestions');
          setSuggestions(suggestionsData);
          setIsLoading(false);
        },
        (err) => {
          console.error('[RealtimeSuggestions] Error:', err);
          logError(err, {
            operation: 'useRealtimeSuggestions.onSnapshot',
            metadata: { paragraphId },
          });

          // Check if it's an index error and fall back to polling
          if (err.message?.includes('index') || err.code === 'failed-precondition') {
            console.info('[RealtimeSuggestions] Index required, falling back to polling');
            setUsePollingFallback(true);
          }

          setError(err as Error);
          setIsLoading(false);
        }
      );
    } catch (err) {
      console.error('[RealtimeSuggestions] Setup error:', err);
      logError(err, {
        operation: 'useRealtimeSuggestions.setup',
        metadata: { paragraphId },
      });
      setError(err as Error);
      setIsLoading(false);

      // Fall back to polling on any setup error
      setUsePollingFallback(true);
    }

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [paragraphId, enabled, usePollingFallback, isAuthReady, isAuthenticated]);

  // Polling fallback effect
  useEffect(() => {
    if (!enabled || !paragraphId || !usePollingFallback) {
      return;
    }

    console.info('[RealtimeSuggestions] Using polling fallback');
    fetchSuggestions();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchSuggestions, SUGGESTIONS.REALTIME_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [paragraphId, enabled, usePollingFallback, fetchSuggestions]);

  // Sync suggestion count to uiStore when suggestions change
  const setSuggestionCount = useUIStore((state) => state.setSuggestionCount);
  useEffect(() => {
    if (paragraphId && !isLoading) {
      console.info('[RealtimeSuggestions] Syncing count to store:', paragraphId, suggestions.length);
      setSuggestionCount(paragraphId, suggestions.length);
    }
  }, [paragraphId, suggestions.length, isLoading, setSuggestionCount]);

  return {
    suggestions,
    isLoading,
    error,
  };
}

/**
 * Callback to manually refresh suggestions (for compatibility with existing code).
 * Not typically needed with real-time listeners, but useful after local mutations.
 */
export function useRefreshSuggestions(): () => void {
  // With real-time listeners, refreshing is handled automatically.
  // This is a no-op stub for API compatibility.
  return useCallback(() => {
    // No-op: real-time listeners auto-refresh
  }, []);
}
