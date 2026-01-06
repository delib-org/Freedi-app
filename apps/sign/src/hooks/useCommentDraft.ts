'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { logError } from '@/lib/utils/errorHandling';

const STORAGE_KEY_PREFIX = 'sign_draft_comment_';
const DEBOUNCE_MS = 300;

interface UseCommentDraftOptions {
  paragraphId: string;
  debounceMs?: number;
}

interface UseCommentDraftReturn {
  draft: string;
  setDraft: (value: string) => void;
  clearDraft: () => void;
  hasDraft: boolean;
}

/**
 * Hook for managing comment draft persistence in localStorage.
 * Auto-saves drafts with debounce as user types.
 */
export function useCommentDraft({
  paragraphId,
  debounceMs = DEBOUNCE_MS,
}: UseCommentDraftOptions): UseCommentDraftReturn {
  const [draft, setDraftState] = useState<string>('');
  const [hasDraft, setHasDraft] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storageKey = `${STORAGE_KEY_PREFIX}${paragraphId}`;

  // Load draft from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const savedDraft = localStorage.getItem(storageKey);
      if (savedDraft) {
        setDraftState(savedDraft);
        setHasDraft(true);
      }
    } catch (error) {
      logError(error, {
        operation: 'useCommentDraft.loadDraft',
        paragraphId,
      });
    }
  }, [storageKey, paragraphId]);

  // Debounced save to localStorage
  const setDraft = useCallback((value: string) => {
    setDraftState(value);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce save
    timeoutRef.current = setTimeout(() => {
      try {
        if (value.trim()) {
          localStorage.setItem(storageKey, value);
          setHasDraft(true);
        } else {
          localStorage.removeItem(storageKey);
          setHasDraft(false);
        }
      } catch (error) {
        logError(error, {
          operation: 'useCommentDraft.saveDraft',
          paragraphId,
        });
      }
    }, debounceMs);
  }, [storageKey, debounceMs, paragraphId]);

  // Clear draft (on successful submit)
  const clearDraft = useCallback(() => {
    setDraftState('');
    setHasDraft(false);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      logError(error, {
        operation: 'useCommentDraft.clearDraft',
        paragraphId,
      });
    }
  }, [storageKey, paragraphId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    draft,
    setDraft,
    clearDraft,
    hasDraft,
  };
}
