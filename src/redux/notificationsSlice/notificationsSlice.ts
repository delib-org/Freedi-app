import { createSlice, createSelector } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../types';
import { NotificationType, updateArray } from '@freedi/shared-types';

// Define a type for the slice state
interface NotificationsState {
	inAppNotifications: NotificationType[];
}

// Define the initial state using that type
const initialState: NotificationsState = {
	inAppNotifications: [],
};

export const notificationsSlicer = createSlice({
	name: 'notifications',
	initialState,
	reducers: {
		setInAppNotificationsAll: (state, action: PayloadAction<NotificationType[]>) => {
			try {
				state.inAppNotifications = action.payload;
			} catch (error) {
				console.error(error);
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
				console.error(error);
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
				console.error(error);
			}
		},
		deleteInAppNotification: (state, action: PayloadAction<string>) => {
			try {
				state.inAppNotifications = state.inAppNotifications.filter(
					(notification) => notification.notificationId !== action.payload,
				);
			} catch (error) {
				console.error(error);
			}
		},
		deleteInAppNotificationsByParentId: (state, action: PayloadAction<string>) => {
			try {
				state.inAppNotifications = state.inAppNotifications.filter(
					(notification) => notification.parentId !== action.payload,
				);
			} catch (error) {
				console.error(error);
			}
		},
		// ✅ Mark single notification as read
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
				console.error(error);
			}
		},
		// ✅ Mark multiple notifications as read
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
				console.error(error);
			}
		},
		// ✅ Mark all notifications for a statement as read
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
				console.error(error);
			}
		},
		// ✅ Mark notifications as viewed in list
		markNotificationsAsViewedInList: (state, action: PayloadAction<string[]>) => {
			try {
				const notificationIds = new Set(action.payload);
				state.inAppNotifications.forEach((notification) => {
					if (notificationIds.has(notification.notificationId)) {
						notification.viewedInList = true;
					}
				});
			} catch (error) {
				console.error(error);
			}
		},
		// ✅ Mark all notifications as read
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
				console.error(error);
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
} = notificationsSlicer.actions;

// Other code such as selectors can use the imported `RootState` type
export const inAppNotificationsSelector = (state: RootState) =>
	state.notifications.inAppNotifications;

export const inAppNotificationsCountSelectorForStatement = (statementId: string) =>
	createSelector(
		(state: RootState) => state.notifications.inAppNotifications,
		(inAppNotifications) =>
			inAppNotifications.filter((notification) => notification.parentId === statementId),
	);

// ✅ New selector: Get only unread notifications (with backward compatibility)
export const unreadNotificationsSelector = createSelector(
	[(state: RootState) => state.notifications.inAppNotifications],
	(notifications) => notifications.filter((n) => !n.read || n.read === undefined),
);

// ✅ New selector: Get unread count for a specific statement (with backward compatibility)
export const unreadCountForStatementSelector = (statementId: string) =>
	createSelector(
		[(state: RootState) => state.notifications.inAppNotifications],
		(notifications) =>
			notifications.filter((n) => n.parentId === statementId && (!n.read || n.read === undefined))
				.length,
	);

// ✅ New selector: Get total unread count (with backward compatibility)
export const totalUnreadCountSelector = createSelector(
	[(state: RootState) => state.notifications.inAppNotifications],
	(notifications) => notifications.filter((n) => !n.read || n.read === undefined).length,
);

// ✅ New selector: Get unread notifications for a statement (with backward compatibility)
export const unreadNotificationsForStatementSelector = (statementId: string) =>
	createSelector([(state: RootState) => state.notifications.inAppNotifications], (notifications) =>
		notifications.filter((n) => n.parentId === statementId && (!n.read || n.read === undefined)),
	);

export default notificationsSlicer.reducer;
