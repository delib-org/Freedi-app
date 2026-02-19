import { createSlice, createSelector } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { NotificationType, updateArray } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

// Define a type for the slice state
interface NotificationsState {
	inAppNotifications: NotificationType[];
}

// Define the initial state using that type
const initialState: NotificationsState = {
	inAppNotifications: [],
};

export const notificationsSlice = createSlice({
	name: 'notifications',
	initialState,
	reducers: {
		setInAppNotificationsAll: (state, action: PayloadAction<NotificationType[]>) => {
			try {
				state.inAppNotifications = action.payload;
			} catch (error) {
				logError(error, { operation: 'redux.notificationsSlice.notificationsSlice.unknown' });
			}
		},
		setInAppNotifications: (state, action: PayloadAction<NotificationType[]>) => {
			try {
				action.payload.forEach((notification) => {
					state.inAppNotifications = updateArray(
						state.inAppNotifications,
						notification,
						'notificationId',
					);
				});
			} catch (error) {
				logError(error, { operation: 'redux.notificationsSlice.notificationsSlice.unknown' });
			}
		},
		setInAppNotification: (state, action: PayloadAction<NotificationType>) => {
			try {
				state.inAppNotifications = updateArray(
					state.inAppNotifications,
					action.payload,
					'notificationId',
				);
			} catch (error) {
				logError(error, { operation: 'redux.notificationsSlice.notificationsSlice.unknown' });
			}
		},
		deleteInAppNotification: (state, action: PayloadAction<string>) => {
			try {
				state.inAppNotifications = state.inAppNotifications.filter(
					(notification) => notification.notificationId !== action.payload,
				);
			} catch (error) {
				logError(error, { operation: 'redux.notificationsSlice.notificationsSlice.unknown' });
			}
		},
		deleteInAppNotificationsByParentId: (state, action: PayloadAction<string>) => {
			try {
				state.inAppNotifications = state.inAppNotifications.filter(
					(notification) => notification.parentId !== action.payload,
				);
			} catch (error) {
				logError(error, { operation: 'redux.notificationsSlice.notificationsSlice.unknown' });
			}
		},
		// Mark single notification as read
		markNotificationAsRead: (state, action: PayloadAction<string>) => {
			try {
				const notification = state.inAppNotifications.find(
					(n) => n.notificationId === action.payload,
				);
				if (notification) {
					notification.read = true;
					notification.readAt = Date.now();
				}
			} catch (error) {
				logError(error, { operation: 'redux.notificationsSlice.notificationsSlice.notification' });
			}
		},
		// Mark multiple notifications as read
		markNotificationsAsRead: (state, action: PayloadAction<string[]>) => {
			try {
				const notificationIds = new Set(action.payload);
				state.inAppNotifications.forEach((notification) => {
					if (notificationIds.has(notification.notificationId)) {
						notification.read = true;
						notification.readAt = Date.now();
					}
				});
			} catch (error) {
				logError(error, {
					operation: 'redux.notificationsSlice.notificationsSlice.notificationIds',
				});
			}
		},
		// Mark all notifications for a statement as read
		markStatementNotificationsAsRead: (state, action: PayloadAction<string>) => {
			try {
				const statementId = action.payload;
				state.inAppNotifications.forEach((notification) => {
					if (notification.parentId === statementId && !notification.read) {
						notification.read = true;
						notification.readAt = Date.now();
						notification.viewedInContext = true;
					}
				});
			} catch (error) {
				logError(error, { operation: 'redux.notificationsSlice.notificationsSlice.statementId' });
			}
		},
		// Mark notifications as viewed in list
		markNotificationsAsViewedInList: (state, action: PayloadAction<string[]>) => {
			try {
				const notificationIds = new Set(action.payload);
				state.inAppNotifications.forEach((notification) => {
					if (notificationIds.has(notification.notificationId)) {
						notification.viewedInList = true;
					}
				});
			} catch (error) {
				logError(error, {
					operation: 'redux.notificationsSlice.notificationsSlice.notificationIds',
				});
			}
		},
		// Mark all notifications as read
		markAllNotificationsAsRead: (state) => {
			try {
				const now = Date.now();
				state.inAppNotifications.forEach((notification) => {
					if (!notification.read) {
						notification.read = true;
						notification.readAt = now;
					}
				});
			} catch (error) {
				logError(error, { operation: 'redux.notificationsSlice.notificationsSlice.now' });
			}
		},
	},
});

export const {
	setInAppNotificationsAll,
	setInAppNotification,
	setInAppNotifications,
	deleteInAppNotification,
	deleteInAppNotificationsByParentId,
	markNotificationAsRead,
	markNotificationsAsRead,
	markStatementNotificationsAsRead,
	markNotificationsAsViewedInList,
	markAllNotificationsAsRead,
} = notificationsSlice.actions;

// Selectors use narrowly-typed state parameters to avoid circular dependencies with store.ts
export const inAppNotificationsSelector = (state: { notifications: NotificationsState }) =>
	state.notifications.inAppNotifications;

export const inAppNotificationsCountSelectorForStatement = (statementId: string) =>
	createSelector(
		(state: { notifications: NotificationsState }) => state.notifications.inAppNotifications,
		(inAppNotifications) =>
			inAppNotifications.filter((notification) => notification.parentId === statementId),
	);

// Get only unread notifications (with backward compatibility)
export const unreadNotificationsSelector = createSelector(
	[(state: { notifications: NotificationsState }) => state.notifications.inAppNotifications],
	(notifications) => notifications.filter((n) => !n.read || n.read === undefined),
);

// Get unread count for a specific statement (with backward compatibility)
export const unreadCountForStatementSelector = (statementId: string) =>
	createSelector(
		[(state: { notifications: NotificationsState }) => state.notifications.inAppNotifications],
		(notifications) =>
			notifications.filter((n) => n.parentId === statementId && (!n.read || n.read === undefined))
				.length,
	);

// Get total unread count (with backward compatibility)
export const totalUnreadCountSelector = createSelector(
	[(state: { notifications: NotificationsState }) => state.notifications.inAppNotifications],
	(notifications) => notifications.filter((n) => !n.read || n.read === undefined).length,
);

// Get unread notifications for a statement (with backward compatibility)
export const unreadNotificationsForStatementSelector = (statementId: string) =>
	createSelector(
		[(state: { notifications: NotificationsState }) => state.notifications.inAppNotifications],
		(notifications) =>
			notifications.filter((n) => n.parentId === statementId && (!n.read || n.read === undefined)),
	);

export default notificationsSlice.reducer;
