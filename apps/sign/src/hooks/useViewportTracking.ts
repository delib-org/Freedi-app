/**
 * useViewportTracking Hook
 * Tracks when paragraphs are viewed for 5+ seconds in viewport
 * Uses a SINGLE shared Intersection Observer for all elements (performance optimization)
 */

import { useRef, useEffect } from 'react';

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

// Shared observer state
interface TrackedElement {
  paragraphId: string;
  documentId: string;
  minDuration: number;
  entryTime: number | null;
  timer: NodeJS.Timeout | null;
  hasBeenViewed: boolean;
}

const trackedElements = new Map<Element, TrackedElement>();
let sharedObserver: IntersectionObserver | null = null;

// Initialize shared observer lazily
function getSharedObserver(threshold: number): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const tracked = trackedElements.get(entry.target);
          if (!tracked) return;

          const viewKey = `${tracked.documentId}--${tracked.paragraphId}`;
          if (viewedParagraphs.has(viewKey) || tracked.hasBeenViewed) return;

          if (entry.isIntersecting) {
            // Element entered viewport
            tracked.entryTime = Date.now();

            // Set timer to record view after minDuration
            tracked.timer = setTimeout(() => {
              if (!tracked.hasBeenViewed) {
                tracked.hasBeenViewed = true;
                const duration = Math.round((Date.now() - (tracked.entryTime || Date.now())) / 1000);
                recordParagraphView(tracked.paragraphId, tracked.documentId, duration);
              }
            }, tracked.minDuration * 1000);
          } else {
            // Element left viewport - clear timer
            if (tracked.timer) {
              clearTimeout(tracked.timer);
              tracked.timer = null;
            }
            tracked.entryTime = null;
          }
        });
      },
      {
        threshold,
        rootMargin: '0px',
      }
    );
  }
  return sharedObserver;
}

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

// Batch API calls to reduce network requests
let pendingViews: Array<{ paragraphId: string; documentId: string; duration: number }> = [];
let batchTimer: NodeJS.Timeout | null = null;

async function flushPendingViews(): Promise<void> {
  if (pendingViews.length === 0) return;

  const viewsToSend = [...pendingViews];
  pendingViews = [];

  const userId = getUserIdFromCookie();
  const visitorId = userId || getVisitorId();

  // Send views in batch (or individually if batch endpoint doesn't exist)
  for (const view of viewsToSend) {
    const viewKey = `${view.documentId}--${view.paragraphId}`;
    if (viewedParagraphs.has(viewKey)) continue;

    try {
      const response = await fetch(`/api/views/${view.paragraphId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: view.documentId,
          visitorId,
          duration: view.duration,
        }),
      });

      if (response.ok) {
        viewedParagraphs.add(viewKey);
      }
    } catch (error) {
      console.error('[ViewportTracking] Failed to record view:', error);
    }
  }
}

/**
 * Record a paragraph view (batched for performance)
 */
function recordParagraphView(
  paragraphId: string,
  documentId: string,
  duration: number
): void {
  const viewKey = `${documentId}--${paragraphId}`;

  // Skip if already recorded in this session
  if (viewedParagraphs.has(viewKey)) {
    return;
  }

  pendingViews.push({ paragraphId, documentId, duration });

  // Batch API calls - flush after 1 second of no new views
  if (batchTimer) {
    clearTimeout(batchTimer);
  }
  batchTimer = setTimeout(flushPendingViews, 1000);
}

/**
 * Hook to track when a paragraph is viewed in the viewport
 * Uses a shared IntersectionObserver for all elements (O(1) observers instead of O(n))
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
  const hasBeenViewedRef = useRef(false);

  // Check if already viewed in this session
  const viewKey = `${documentId}--${paragraphId}`;
  const alreadyViewed = viewedParagraphs.has(viewKey);

  useEffect(() => {
    const element = ref.current;

    if (!element || !enabled || alreadyViewed) return;

    // Register element with shared observer
    const tracked: TrackedElement = {
      paragraphId,
      documentId,
      minDuration,
      entryTime: null,
      timer: null,
      hasBeenViewed: false,
    };

    trackedElements.set(element, tracked);
    const observer = getSharedObserver(threshold);
    observer.observe(element);

    return () => {
      // Cleanup
      if (tracked.timer) {
        clearTimeout(tracked.timer);
      }
      trackedElements.delete(element);
      observer.unobserve(element);
    };
  }, [paragraphId, documentId, minDuration, threshold, enabled, alreadyViewed]);

  return {
    ref,
    isInViewport: false, // Not tracked in real-time for performance
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
