import { useState, useEffect } from 'react';
import { logError } from '@/utils/errorHandling';

/**
 * Hook to detect online/offline status changes
 * Returns current online status and tracks transitions
 */
export function useOnlineStatus() {
	const [isOnline, setIsOnline] = useState<boolean>(
		typeof navigator !== 'undefined' ? navigator.onLine : true,
	);
	const [wasOffline, setWasOffline] = useState<boolean>(false);

	useEffect(() => {
		// Update online status
		const handleOnline = () => {
			try {
				console.info('[useOnlineStatus] Network connection restored');
				setIsOnline(true);
				setWasOffline(true);

				// Reset wasOffline after a delay so the "back online" message can be shown
				setTimeout(() => {
					setWasOffline(false);
				}, 5000);
			} catch (error) {
				logError(error, {
					operation: 'useOnlineStatus.handleOnline',
				});
			}
		};

		// Update offline status
		const handleOffline = () => {
			try {
				console.info('[useOnlineStatus] Network connection lost');
				setIsOnline(false);
			} catch (error) {
				logError(error, {
					operation: 'useOnlineStatus.handleOffline',
				});
			}
		};

		// Add event listeners
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		// Cleanup
		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	}, []);

	return { isOnline, wasOffline };
}
