'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { logError } from '@/lib/utils/errorHandling';

const STORAGE_KEY_PREFIX = 'sign_draft_suggestion_';
const DEBOUNCE_MS = 300;

interface SuggestionDraft {
  suggestedContent: string;
  reasoning: string;
}

interface UseSuggestionDraftOptions {
  paragraphId: string;
  debounceMs?: number;
}

interface UseSuggestionDraftReturn {
  suggestedContent: string;
  reasoning: string;
  setSuggestedContent: (value: string) => void;
  setReasoning: (value: string) => void;
  clearDraft: () => void;
  hasDraft: boolean;
}

/**
 * Hook for managing suggestion draft persistence in localStorage.
 * Auto-saves drafts with debounce as user types.
 */
export function useSuggestionDraft({
  paragraphId,
  debounceMs = DEBOUNCE_MS,
}: UseSuggestionDraftOptions): UseSuggestionDraftReturn {
  const [suggestedContent, setSuggestedContentState] = useState<string>('');
  const [reasoning, setReasoningState] = useState<string>('');
  const [hasDraft, setHasDraft] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storageKey = `${STORAGE_KEY_PREFIX}${paragraphId}`;

  // Load draft from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const savedDraft = localStorage.getItem(storageKey);
      if (savedDraft) {
        const parsed: SuggestionDraft = JSON.parse(savedDraft);
        setSuggestedContentState(parsed.suggestedContent || '');
        setReasoningState(parsed.reasoning || '');
        setHasDraft(!!parsed.suggestedContent?.trim());
      }
    } catch (error) {
      logError(error, {
        operation: 'useSuggestionDraft.loadDraft',
        paragraphId,
      });
    }
  }, [storageKey, paragraphId]);

  // Save to localStorage with debounce
  const saveDraft = useCallback((content: string, reason: string) => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce save
    timeoutRef.current = setTimeout(() => {
      try {
        if (content.trim()) {
          const draft: SuggestionDraft = {
            suggestedContent: content,
            reasoning: reason,
          };
          localStorage.setItem(storageKey, JSON.stringify(draft));
          setHasDraft(true);
        } else {
          localStorage.removeItem(storageKey);
          setHasDraft(false);
        }
      } catch (error) {
        logError(error, {
          operation: 'useSuggestionDraft.saveDraft',
          paragraphId,
        });
      }
    }, debounceMs);
  }, [storageKey, debounceMs, paragraphId]);

  // Set suggested content
  const setSuggestedContent = useCallback((value: string) => {
    setSuggestedContentState(value);
    saveDraft(value, reasoning);
  }, [saveDraft, reasoning]);

  // Set reasoning
  const setReasoning = useCallback((value: string) => {
    setReasoningState(value);
    saveDraft(suggestedContent, value);
  }, [saveDraft, suggestedContent]);

  // Clear draft (on successful submit)
  const clearDraft = useCallback(() => {
    setSuggestedContentState('');
    setReasoningState('');
    setHasDraft(false);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      logError(error, {
        operation: 'useSuggestionDraft.clearDraft',
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
    suggestedContent,
    reasoning,
    setSuggestedContent,
    setReasoning,
    clearDraft,
    hasDraft,
  };
}
