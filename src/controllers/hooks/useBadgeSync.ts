import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { totalUnreadCountSelector } from '@/redux/notificationsSlice/notificationsSlice';

/**
 * Sets the app badge count using the Badging API
 * Handles browser compatibility for different badge API implementations
 */
const setAppBadge = async (count: number): Promise<void> => {
	try {
		if (count === 0) {
			// Clear badge
			if ('clearAppBadge' in navigator) {
				await navigator.clearAppBadge();
			} else if ('clearExperimentalAppBadge' in navigator) {
				await navigator.clearExperimentalAppBadge();
			} else if ('ExperimentalBadge' in window) {
				await window.ExperimentalBadge?.clear();
			}
		} else {
			// Set badge count
			if ('setAppBadge' in navigator) {
				await navigator.setAppBadge(count);
			} else if ('setExperimentalAppBadge' in navigator) {
				await navigator.setExperimentalAppBadge(count);
			} else if ('ExperimentalBadge' in window) {
				await window.ExperimentalBadge?.set(count);
			}
		}
	} catch (error) {
		// Badge API not supported or permission denied - fail silently
		console.info('[useBadgeSync] Badge API not available:', error);
	}
};

/**
 * Syncs the app badge count with IndexedDB for service worker coordination
 */
const syncBadgeToIndexedDB = async (count: number): Promise<void> => {
	try {
		const openRequest = indexedDB.open('FreeDiNotifications', 1);

		openRequest.onupgradeneeded = (event) => {
			const target = event.target as IDBOpenDBRequest;
			const db = target.result;
			if (!db.objectStoreNames.contains('badgeCounter')) {
				db.createObjectStore('badgeCounter', { keyPath: 'id' });
			}
		};

		openRequest.onsuccess = (event) => {
			try {
				const target = event.target as IDBOpenDBRequest;
				const db = target.result;

				if (!db.objectStoreNames.contains('badgeCounter')) {
					return;
				}

				const transaction = db.transaction('badgeCounter', 'readwrite');
				const store = transaction.objectStore('badgeCounter');
				store.put({ id: 'badge', count });
			} catch (innerError) {
				console.info('[useBadgeSync] Error accessing badgeCounter store:', innerError);
			}
		};
	} catch (error) {
		console.info('[useBadgeSync] IndexedDB operation failed:', error);
	}
};

/**
 * Hook that syncs the Redux unread notification count with the app badge
 *
 * This hook:
 * 1. Subscribes to the total unread count from Redux
 * 2. Updates the app badge when the count changes
 * 3. Syncs with IndexedDB for service worker coordination
 * 4. Handles browser API compatibility
 *
 * @example
 * ```tsx
 * // Use in a top-level component like App.tsx or PWAWrapper.tsx
 * const App = () => {
 *   useBadgeSync();
 *   return <AppContent />;
 * };
 * ```
 */
export const useBadgeSync = (): void => {
	const unreadCount = useSelector(totalUnreadCountSelector);

	useEffect(() => {
		// Update both the app badge and IndexedDB
		setAppBadge(unreadCount);
		syncBadgeToIndexedDB(unreadCount);
	}, [unreadCount]);
};

export default useBadgeSync;
