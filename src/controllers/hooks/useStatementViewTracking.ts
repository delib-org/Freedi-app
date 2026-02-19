import { useEffect, useRef, useState } from 'react';
import { analyticsService } from '@/services/analytics';

interface ViewTrackingOptions {
	statementId: string;
	threshold?: number; // Percentage of element visible to start tracking (0-1)
	minViewTime?: number; // Minimum time in ms before tracking
}

export function useStatementViewTracking({
	statementId,
	threshold = 0.5, // 50% visible
	minViewTime = 1000, // 1 second
}: ViewTrackingOptions) {
	const elementRef = useRef<HTMLDivElement>(null);
	const startTimeRef = useRef<number | null>(null);
	const hasInteractedRef = useRef(false);
	const hasSentViewEventRef = useRef(false);
	const [isVisible, setIsVisible] = useState(false);

	// Mark that user has interacted with the statement
	const markInteraction = () => {
		hasInteractedRef.current = true;
	};

	useEffect(() => {
		const element = elementRef.current;
		if (!element) return;

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
						// Element is visible
						if (!startTimeRef.current) {
							startTimeRef.current = Date.now();
							setIsVisible(true);

							// Send view event after minimum time
							if (!hasSentViewEventRef.current) {
								setTimeout(() => {
									if (startTimeRef.current) {
										analyticsService.trackStatementView(statementId, 'feed');
										hasSentViewEventRef.current = true;
									}
								}, minViewTime);
							}
						}
					} else {
						// Element is not visible
						if (startTimeRef.current) {
							const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);

							// Only track if viewed for more than minimum time
							if (timeSpent >= minViewTime / 1000) {
								const scrollDepth = calculateScrollDepth(element);
								analyticsService.trackStatementViewTime(
									statementId,
									timeSpent,
									hasInteractedRef.current ? 'engaged' : 'read_only',
									scrollDepth,
								);
							}

							startTimeRef.current = null;
							setIsVisible(false);
						}
					}
				});
			},
			{
				threshold: [0, threshold, 1],
				rootMargin: '0px',
			},
		);

		observer.observe(element);

		// Cleanup
		return () => {
			observer.disconnect();

			// Send final tracking if element was being viewed
			if (startTimeRef.current) {
				const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
				if (timeSpent >= minViewTime / 1000) {
					analyticsService.trackStatementViewTime(
						statementId,
						timeSpent,
						hasInteractedRef.current ? 'engaged' : 'read_only',
					);
				}
			}
		};
	}, [statementId, threshold, minViewTime]);

	return {
		elementRef,
		isVisible,
		markInteraction,
	};
}

// Helper to calculate how much of the element was scrolled
function calculateScrollDepth(element: HTMLElement): number {
	const rect = element.getBoundingClientRect();
	const windowHeight = window.innerHeight;

	// If element is taller than viewport
	if (rect.height > windowHeight) {
		const visibleHeight = Math.min(rect.bottom, windowHeight) - Math.max(rect.top, 0);

		return Math.round((visibleHeight / rect.height) * 100);
	}

	// If element fits in viewport
	return rect.top >= 0 && rect.bottom <= windowHeight ? 100 : 50;
}
