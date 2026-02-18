import { useEffect, useRef } from 'react';

interface SwipeOptions {
	onSwipeLeft?: () => void;
	onSwipeRight?: () => void;
	threshold?: number;
	enabled?: boolean;
}

export const useSwipe = (options: SwipeOptions) => {
	const { onSwipeLeft, onSwipeRight, threshold = 50, enabled = true } = options;

	const touchStartX = useRef<number>(0);
	const touchStartY = useRef<number>(0);
	const touchEndX = useRef<number>(0);
	const touchEndY = useRef<number>(0);
	const isSwiping = useRef<boolean>(false);
	const elementRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!enabled || !elementRef.current) return;

		const element = elementRef.current;

		const handleTouchStart = (e: TouchEvent) => {
			touchStartX.current = e.touches[0].clientX;
			touchStartY.current = e.touches[0].clientY;
			touchEndX.current = e.touches[0].clientX;
			touchEndY.current = e.touches[0].clientY;
			isSwiping.current = false;
		};

		const handleTouchMove = (e: TouchEvent) => {
			touchEndX.current = e.touches[0].clientX;
			touchEndY.current = e.touches[0].clientY;

			const deltaX = Math.abs(touchEndX.current - touchStartX.current);
			const deltaY = Math.abs(touchEndY.current - touchStartY.current);

			// Check if horizontal swipe is more prominent than vertical
			if (deltaX > 10 && deltaX > deltaY) {
				isSwiping.current = true;
			}
		};

		const handleTouchEnd = () => {
			if (!isSwiping.current) {
				touchStartX.current = 0;
				touchStartY.current = 0;
				touchEndX.current = 0;
				touchEndY.current = 0;

				return;
			}

			const swipeDistance = touchEndX.current - touchStartX.current;
			const verticalDistance = Math.abs(touchEndY.current - touchStartY.current);

			// Only trigger swipe if horizontal movement is significant and greater than vertical
			if (Math.abs(swipeDistance) > threshold && Math.abs(swipeDistance) > verticalDistance) {
				if (swipeDistance > 0 && onSwipeRight) {
					onSwipeRight();
				} else if (swipeDistance < 0 && onSwipeLeft) {
					onSwipeLeft();
				}
			}

			touchStartX.current = 0;
			touchStartY.current = 0;
			touchEndX.current = 0;
			touchEndY.current = 0;
			isSwiping.current = false;
		};

		element.addEventListener('touchstart', handleTouchStart, { passive: true });
		element.addEventListener('touchmove', handleTouchMove, { passive: true });
		element.addEventListener('touchend', handleTouchEnd);

		return () => {
			element.removeEventListener('touchstart', handleTouchStart);
			element.removeEventListener('touchmove', handleTouchMove);
			element.removeEventListener('touchend', handleTouchEnd);
		};
	}, [enabled, onSwipeLeft, onSwipeRight, threshold]);

	return elementRef;
};
