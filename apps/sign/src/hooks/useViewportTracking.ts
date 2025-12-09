/**
 * useViewportTracking Hook
 * Tracks when paragraphs are viewed for 5+ seconds in viewport
 * Uses Intersection Observer for efficient viewport detection
 */

import { useRef, useEffect, useCallback } from 'react';

interface UseViewportTrackingOptions {
  paragraphId: string;
  documentId: string;
  /** Minimum seconds element must be visible to count as viewed (default: 5) */
  minDuration?: number;
  /** Minimum percentage of element visible to count (default: 0.5 = 50%) */
  threshold?: number;
  /** Whether tracking is enabled (default: true) */
  enabled?: boolean;
}

interface ViewportTrackingReturn {
  /** Ref to attach to the element to track */
  ref: React.RefObject<HTMLElement | null>;
  /** Whether the element is currently in viewport */
  isInViewport: boolean;
  /** Whether the element has been viewed for the minimum duration */
  hasBeenViewed: boolean;
}

// Track which paragraphs have already been recorded to avoid duplicates
const viewedParagraphs = new Set<string>();

// Generate or retrieve visitor ID
function getVisitorId(): string {
  if (typeof window === 'undefined') return '';

  const STORAGE_KEY = 'freedi_visitor_id';
  let visitorId = localStorage.getItem(STORAGE_KEY);

  if (!visitorId) {
    visitorId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(STORAGE_KEY, visitorId);
  }

  return visitorId;
}

// Get user ID from cookie if authenticated
function getUserIdFromCookie(): string | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'userId') {
      return value;
    }
  }

  return null;
}

/**
 * Record a paragraph view to the API
 */
async function recordParagraphView(
  paragraphId: string,
  documentId: string,
  duration: number
): Promise<void> {
  const viewKey = `${documentId}--${paragraphId}`;

  // Skip if already recorded in this session
  if (viewedParagraphs.has(viewKey)) {
    return;
  }

  const userId = getUserIdFromCookie();
  const visitorId = userId || getVisitorId();

  try {
    const response = await fetch(`/api/views/${paragraphId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        visitorId,
        duration,
      }),
    });

    if (response.ok) {
      viewedParagraphs.add(viewKey);
    }
  } catch (error) {
    console.error('[ViewportTracking] Failed to record view:', error);
  }
}

/**
 * Hook to track when a paragraph is viewed in the viewport
 */
export function useViewportTracking(options: UseViewportTrackingOptions): ViewportTrackingReturn {
  const {
    paragraphId,
    documentId,
    minDuration = 5,
    threshold = 0.5,
    enabled = true,
  } = options;

  const ref = useRef<HTMLElement | null>(null);
  const isInViewportRef = useRef(false);
  const hasBeenViewedRef = useRef(false);
  const entryTimeRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Check if already viewed in this session
  const viewKey = `${documentId}--${paragraphId}`;
  const alreadyViewed = viewedParagraphs.has(viewKey);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];

      if (!entry || !enabled || alreadyViewed) return;

      if (entry.isIntersecting) {
        // Element entered viewport
        isInViewportRef.current = true;
        entryTimeRef.current = Date.now();

        // Set timer to record view after minDuration
        timerRef.current = setTimeout(() => {
          if (isInViewportRef.current && !hasBeenViewedRef.current) {
            hasBeenViewedRef.current = true;
            const duration = Math.round((Date.now() - (entryTimeRef.current || Date.now())) / 1000);
            recordParagraphView(paragraphId, documentId, duration);
          }
        }, minDuration * 1000);
      } else {
        // Element left viewport
        isInViewportRef.current = false;

        // Clear timer if element left before minDuration
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    },
    [paragraphId, documentId, minDuration, enabled, alreadyViewed]
  );

  useEffect(() => {
    const element = ref.current;

    if (!element || !enabled || alreadyViewed) return;

    const observer = new IntersectionObserver(handleIntersection, {
      threshold,
      rootMargin: '0px',
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [handleIntersection, threshold, enabled, alreadyViewed]);

  return {
    ref,
    isInViewport: isInViewportRef.current,
    hasBeenViewed: hasBeenViewedRef.current || alreadyViewed,
  };
}

/**
 * Clear recorded views (useful for testing)
 */
export function clearViewedParagraphs(): void {
  viewedParagraphs.clear();
}

export default useViewportTracking;
