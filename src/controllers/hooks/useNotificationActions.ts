import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
	markNotificationAsRead,
	markNotificationsAsRead,
	markStatementNotificationsAsRead,
	markAllNotificationsAsRead,
	inAppNotificationsSelector,
	unreadNotificationsSelector,
} from '@/redux/notificationsSlice/notificationsSlice';
import {
	markNotificationAsReadDB,
	markMultipleNotificationsAsReadDB,
	markStatementNotificationsAsReadDB,
} from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import { creatorSelector } from '@/redux/creator/creatorSlice';

/**
 * ✅ Custom hook for managing notification actions
 * Provides easy-to-use functions for marking notifications as read
 */
export function useNotificationActions() {
	const dispatch = useDispatch();
	const creator = useSelector(creatorSelector);
	const allNotifications = useSelector(inAppNotificationsSelector);
	const unreadNotifications = useSelector(unreadNotificationsSelector);

	// Get notifications excluding current user's
	const userNotifications = allNotifications.filter((n) => n.creatorId !== creator?.uid);
	const userUnreadNotifications = unreadNotifications.filter((n) => n.creatorId !== creator?.uid);

	/**
	 * Mark a single notification as read
	 */
	const markAsRead = useCallback(
		async (notificationId: string) => {
			try {
				// Update in Redux immediately for optimistic UI
				dispatch(markNotificationAsRead(notificationId));
				// Then sync with database
				await markNotificationAsReadDB(notificationId);
			} catch (error) {
				console.error('Error marking notification as read:', error);
			}
		},
		[dispatch],
	);

	/**
	 * Mark multiple notifications as read
	 */
	const markMultipleAsRead = useCallback(
		async (notificationIds: string[]) => {
			try {
				// Update in Redux immediately
				dispatch(markNotificationsAsRead(notificationIds));
				// Then sync with database
				await markMultipleNotificationsAsReadDB(notificationIds);
			} catch (error) {
				console.error('Error marking multiple notifications as read:', error);
			}
		},
		[dispatch],
	);

	/**
	 * Mark all notifications for a specific statement as read
	 */
	const markStatementAsRead = useCallback(
		async (statementId: string) => {
			try {
				// Update in Redux immediately
				dispatch(markStatementNotificationsAsRead(statementId));
				// Then sync with database
				await markStatementNotificationsAsReadDB(statementId);
			} catch (error) {
				console.error('Error marking statement notifications as read:', error);
			}
		},
		[dispatch],
	);

	/**
	 * Mark ALL notifications as read
	 */
	const markAllAsRead = useCallback(async () => {
		try {
			// Get all unread notification IDs
			const unreadIds = userUnreadNotifications.map((n) => n.notificationId);

			if (unreadIds.length === 0) return;

			// Update in Redux immediately
			dispatch(markAllNotificationsAsRead());
			// Then sync with database
			await markMultipleNotificationsAsReadDB(unreadIds);
		} catch (error) {
			console.error('Error marking all notifications as read:', error);
		}
	}, [dispatch, userUnreadNotifications]);

	/**
	 * Get unread count for a specific statement (with backward compatibility)
	 */
	const getStatementUnreadCount = useCallback(
		(statementId: string): number => {
			return userNotifications.filter(
				(n) => n.parentId === statementId && (!n.read || n.read === undefined),
			).length;
		},
		[userNotifications],
	);

	/**
	 * Check if a specific notification is read
	 */
	const isNotificationRead = useCallback(
		(notificationId: string): boolean => {
			const notification = allNotifications.find((n) => n.notificationId === notificationId);

			return notification?.read || false;
		},
		[allNotifications],
	);

	return {
		// Actions
		markAsRead,
		markMultipleAsRead,
		markStatementAsRead,
		markAllAsRead,

		// Data
		notifications: userNotifications,
		unreadNotifications: userUnreadNotifications,
		totalUnreadCount: userUnreadNotifications.length,

		// Utilities
		getStatementUnreadCount,
		isNotificationRead,
	};
}

/**
 * ✅ Hook to automatically mark notifications as read when viewing a statement
 */
export function useAutoMarkAsRead(statementId: string | undefined, enabled: boolean = true) {
	const { markStatementAsRead, getStatementUnreadCount } = useNotificationActions();

	// Auto-mark as read after a delay
	useCallback(() => {
		if (!statementId || !enabled) return;

		const unreadCount = getStatementUnreadCount(statementId);
		if (unreadCount === 0) return;

		// Mark as read after 2 seconds of viewing
		const timer = setTimeout(() => {
			markStatementAsRead(statementId);
		}, 2000);

		return () => clearTimeout(timer);
	}, [statementId, enabled, markStatementAsRead, getStatementUnreadCount]);
}
