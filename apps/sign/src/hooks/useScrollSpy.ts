'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseScrollSpyOptions {
  /**
   * Offset from top of viewport to consider an element "active"
   * @default 120
   */
  offset?: number;
  /**
   * Selector prefix for finding elements
   * @default 'paragraph-'
   */
  selectorPrefix?: string;
}

/**
 * Hook to track which section is currently visible in the viewport
 *
 * @param itemIds - Array of paragraph IDs to track
 * @param options - Configuration options
 * @returns Currently active section ID or null
 */
export function useScrollSpy(
  itemIds: string[],
  options: UseScrollSpyOptions = {}
): string | null {
  const { offset = 120, selectorPrefix = 'paragraph-' } = options;
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibleSections = useRef<Map<string, number>>(new Map());

  const updateActiveSection = useCallback(() => {
    // Find the topmost visible section
    let topSection: string | null = null;
    let topPosition = Infinity;

    visibleSections.current.forEach((position, id) => {
      if (position < topPosition) {
        topPosition = position;
        topSection = id;
      }
    });

    setActiveId(topSection);
  }, []);

  useEffect(() => {
    // Skip if no items to track or not in browser
    if (!itemIds || itemIds.length === 0 || typeof window === 'undefined') {
      return;
    }

    // Clean up existing observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    // Create intersection observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.id.replace(selectorPrefix, '');

          if (entry.isIntersecting) {
            // Store the element's position when it becomes visible
            visibleSections.current.set(id, entry.boundingClientRect.top);
          } else {
            // Remove from visible sections when it leaves viewport
            visibleSections.current.delete(id);
          }
        });

        updateActiveSection();
      },
      {
        rootMargin: `-${offset}px 0px -50% 0px`,
        threshold: [0, 0.1, 0.5, 1],
      }
    );

    observerRef.current = observer;

    // Observe all section elements
    itemIds.forEach((id) => {
      const element = document.getElementById(`${selectorPrefix}${id}`);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
      observerRef.current = null;
      visibleSections.current.clear();
    };
  }, [itemIds, offset, selectorPrefix, updateActiveSection]);

  return activeId;
}

/**
 * Scrolls smoothly to a specific section
 *
 * @param paragraphId - The paragraph ID to scroll to
 * @param offset - Offset from top (default 100px for header)
 */
export function scrollToSection(paragraphId: string, offset: number = 100): void {
  const element = document.getElementById(`paragraph-${paragraphId}`);

  if (!element) {
    console.error(`Element with id paragraph-${paragraphId} not found`);
    return;
  }

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  const top = element.getBoundingClientRect().top + window.scrollY - offset;

  window.scrollTo({
    top,
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  });

  // Add a brief highlight effect to the target element
  element.classList.add('toc-scroll-target');
  setTimeout(() => {
    element.classList.remove('toc-scroll-target');
  }, 2000);
}
