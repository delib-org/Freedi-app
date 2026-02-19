/**
 * Tests for notificationsSlice Redux store
 */

// Mock @freedi/shared-types before import
jest.mock('@freedi/shared-types', () => ({
	updateArray: jest.fn((array: unknown[], newItem: unknown, key: string) => {
		const arr = array as Record<string, unknown>[];
		const item = newItem as Record<string, unknown>;
		const index = arr.findIndex((i) => i[key] === item[key]);
		if (index === -1) {
			return [...arr, item];
		}
		const newArr = [...arr];
		newArr[index] = item;

		return newArr;
	}),
}));

jest.mock('@/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

interface MockNotification {
	notificationId: string;
	parentId: string;
	text: string;
	read?: boolean;
	readAt?: number;
	viewedInList?: boolean;
	viewedInContext?: boolean;
}

import {
	notificationsSlice,
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
	inAppNotificationsSelector,
	unreadNotificationsSelector,
	totalUnreadCountSelector,
	unreadCountForStatementSelector,
} from '../notificationsSlice';

describe('notificationsSlice', () => {
	const mockNotification1: MockNotification = {
		notificationId: 'notif-1',
		parentId: 'stmt-1',
		text: 'First notification',
	};

	const mockNotification2: MockNotification = {
		notificationId: 'notif-2',
		parentId: 'stmt-1',
		text: 'Second notification',
	};

	const mockNotification3: MockNotification = {
		notificationId: 'notif-3',
		parentId: 'stmt-2',
		text: 'Third notification',
	};

	const initialState = notificationsSlice.getInitialState();

	describe('reducers', () => {
		describe('setInAppNotificationsAll', () => {
			it('should replace all notifications', () => {
				const notifications = [mockNotification1, mockNotification2];
				const newState = notificationsSlice.reducer(
					initialState,
					setInAppNotificationsAll(notifications as Parameters<typeof setInAppNotificationsAll>[0]),
				);
				expect(newState.inAppNotifications).toHaveLength(2);
			});
		});

		describe('setInAppNotification', () => {
			it('should add a new notification', () => {
				const newState = notificationsSlice.reducer(
					initialState,
					setInAppNotification(mockNotification1 as Parameters<typeof setInAppNotification>[0]),
				);
				expect(newState.inAppNotifications).toHaveLength(1);
			});

			it('should update an existing notification', () => {
				const stateWithNotif = {
					...initialState,
					inAppNotifications: [mockNotification1],
				};
				const updated = { ...mockNotification1, text: 'Updated' };
				const newState = notificationsSlice.reducer(
					stateWithNotif,
					setInAppNotification(updated as Parameters<typeof setInAppNotification>[0]),
				);
				expect(newState.inAppNotifications).toHaveLength(1);
			});
		});

		describe('setInAppNotifications', () => {
			it('should add multiple notifications', () => {
				const notifications = [mockNotification1, mockNotification2];
				const newState = notificationsSlice.reducer(
					initialState,
					setInAppNotifications(notifications as Parameters<typeof setInAppNotifications>[0]),
				);
				expect(newState.inAppNotifications).toHaveLength(2);
			});
		});

		describe('deleteInAppNotification', () => {
			it('should delete a notification by ID', () => {
				const stateWithNotifs = {
					...initialState,
					inAppNotifications: [mockNotification1, mockNotification2],
				};
				const newState = notificationsSlice.reducer(
					stateWithNotifs,
					deleteInAppNotification('notif-1'),
				);
				expect(newState.inAppNotifications).toHaveLength(1);
				expect(newState.inAppNotifications[0].notificationId).toBe('notif-2');
			});
		});

		describe('deleteInAppNotificationsByParentId', () => {
			it('should delete all notifications for a parent', () => {
				const stateWithNotifs = {
					...initialState,
					inAppNotifications: [mockNotification1, mockNotification2, mockNotification3],
				};
				const newState = notificationsSlice.reducer(
					stateWithNotifs,
					deleteInAppNotificationsByParentId('stmt-1'),
				);
				expect(newState.inAppNotifications).toHaveLength(1);
				expect(newState.inAppNotifications[0].parentId).toBe('stmt-2');
			});
		});

		describe('markNotificationAsRead', () => {
			it('should mark a single notification as read', () => {
				const stateWithNotifs = {
					...initialState,
					inAppNotifications: [{ ...mockNotification1 }],
				};
				const newState = notificationsSlice.reducer(
					stateWithNotifs,
					markNotificationAsRead('notif-1'),
				);
				expect(newState.inAppNotifications[0].read).toBe(true);
				expect(newState.inAppNotifications[0].readAt).toBeDefined();
			});

			it('should do nothing if notification not found', () => {
				const stateWithNotifs = {
					...initialState,
					inAppNotifications: [{ ...mockNotification1 }],
				};
				const newState = notificationsSlice.reducer(
					stateWithNotifs,
					markNotificationAsRead('non-existent'),
				);
				expect(newState.inAppNotifications[0].read).toBeUndefined();
			});
		});

		describe('markNotificationsAsRead', () => {
			it('should mark multiple notifications as read', () => {
				const stateWithNotifs = {
					...initialState,
					inAppNotifications: [
						{ ...mockNotification1 },
						{ ...mockNotification2 },
						{ ...mockNotification3 },
					],
				};
				const newState = notificationsSlice.reducer(
					stateWithNotifs,
					markNotificationsAsRead(['notif-1', 'notif-3']),
				);
				expect(newState.inAppNotifications[0].read).toBe(true);
				expect(newState.inAppNotifications[1].read).toBeUndefined();
				expect(newState.inAppNotifications[2].read).toBe(true);
			});
		});

		describe('markStatementNotificationsAsRead', () => {
			it('should mark all unread notifications for a statement as read', () => {
				const stateWithNotifs = {
					...initialState,
					inAppNotifications: [
						{ ...mockNotification1 },
						{ ...mockNotification2 },
						{ ...mockNotification3 },
					],
				};
				const newState = notificationsSlice.reducer(
					stateWithNotifs,
					markStatementNotificationsAsRead('stmt-1'),
				);
				expect(newState.inAppNotifications[0].read).toBe(true);
				expect(newState.inAppNotifications[0].viewedInContext).toBe(true);
				expect(newState.inAppNotifications[1].read).toBe(true);
				expect(newState.inAppNotifications[2].read).toBeUndefined();
			});
		});

		describe('markNotificationsAsViewedInList', () => {
			it('should mark notifications as viewed in list', () => {
				const stateWithNotifs = {
					...initialState,
					inAppNotifications: [
						{ ...mockNotification1 },
						{ ...mockNotification2 },
					],
				};
				const newState = notificationsSlice.reducer(
					stateWithNotifs,
					markNotificationsAsViewedInList(['notif-1']),
				);
				expect(newState.inAppNotifications[0].viewedInList).toBe(true);
				expect(newState.inAppNotifications[1].viewedInList).toBeUndefined();
			});
		});

		describe('markAllNotificationsAsRead', () => {
			it('should mark all unread notifications as read', () => {
				const stateWithNotifs = {
					...initialState,
					inAppNotifications: [
						{ ...mockNotification1 },
						{ ...mockNotification2, read: true },
						{ ...mockNotification3 },
					],
				};
				const newState = notificationsSlice.reducer(
					stateWithNotifs,
					markAllNotificationsAsRead(),
				);
				expect(newState.inAppNotifications.every((n) => n.read === true)).toBe(true);
			});
		});
	});

	describe('selectors', () => {
		const stateWithNotifications = {
			notifications: {
				inAppNotifications: [
					{ ...mockNotification1, read: false },
					{ ...mockNotification2, read: true },
					{ ...mockNotification3 },
				],
			},
		} as never;

		describe('inAppNotificationsSelector', () => {
			it('should return all notifications', () => {
				const result = inAppNotificationsSelector(stateWithNotifications);
				expect(result).toHaveLength(3);
			});
		});

		describe('unreadNotificationsSelector', () => {
			it('should return only unread notifications', () => {
				const result = unreadNotificationsSelector(stateWithNotifications);
				// notif-1 has read: false, notif-3 has read: undefined
				expect(result).toHaveLength(2);
			});
		});

		describe('totalUnreadCountSelector', () => {
			it('should return count of unread notifications', () => {
				const result = totalUnreadCountSelector(stateWithNotifications);
				expect(result).toBe(2);
			});
		});

		describe('unreadCountForStatementSelector', () => {
			it('should return unread count for a specific statement', () => {
				const selector = unreadCountForStatementSelector('stmt-1');
				const result = selector(stateWithNotifications);
				// stmt-1 has notif-1 (unread) and notif-2 (read)
				expect(result).toBe(1);
			});

			it('should return 0 for statement with no notifications', () => {
				const selector = unreadCountForStatementSelector('stmt-99');
				const result = selector(stateWithNotifications);
				expect(result).toBe(0);
			});
		});
	});
});
