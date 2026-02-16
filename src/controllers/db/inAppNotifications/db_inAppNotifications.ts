import { store } from '@/redux/store';
import {
	collection,
	deleteDoc,
	getDocs,
	limit,
	onSnapshot,
	orderBy,
	query,
	Unsubscribe,
	where,
	doc,
	updateDoc,
	writeBatch,
} from 'firebase/firestore';
import { DB } from '../config';
import { Collections, NotificationType } from '@freedi/shared-types';
import {
	setInAppNotificationsAll,
	markNotificationAsRead,
	markNotificationsAsRead,
	markStatementNotificationsAsRead,
} from '@/redux/notificationsSlice/notificationsSlice';

export function listenToInAppNotifications(): Unsubscribe {
	try {
		const user = store.getState().creator.creator;

		if (!user) throw new Error('User not found');

		const inAppNotificationsRef = collection(DB, Collections.inAppNotifications);
		const q = query(
			inAppNotificationsRef,
			where('userId', '==', user.uid),
			orderBy('createdAt', 'desc'),
			limit(100),
		);

		return onSnapshot(
			q,
			// Success callback with error handling inside
			(inAppNotDBs) => {
				try {
					const notifications: NotificationType[] = [];
					inAppNotDBs.forEach((inAppNotDB) => {
						const data = inAppNotDB.data();
						// Convert Firestore Timestamp to milliseconds if it exists
						const inAppNot = {
							...data,
							// Convert readAt from Firestore Timestamp to milliseconds if it exists
							readAt: data.readAt?.toMillis ? data.readAt.toMillis() : data.readAt,
							// Also ensure createdAt is in milliseconds
							createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt,
						} as NotificationType;
						notifications.push(inAppNot);
					});
					store.dispatch(setInAppNotificationsAll(notifications));
				} catch (error) {
					console.error('Error processing notifications snapshot:', error);
					// Still allow the listener to continue functioning
				}
			},
			// Error callback for the onSnapshot itself
			(error) => {
				console.error('Error in notifications snapshot listener:', error);
			},
		);
	} catch (error) {
		console.error('In listenToInAppNotifications', error.message);

		return () => {
			return;
		};
	}
}

export async function clearInAppNotifications(statementId: string) {
	try {
		if (!statementId) {
			console.error('clearInAppNotifications: statementId is required');

			return;
		}

		const user = store.getState().creator.creator;
		if (!user) {
			console.error('clearInAppNotifications: User not found');

			return;
		}

		const inAppNotificationsRef = collection(DB, Collections.inAppNotifications);
		const q = query(
			inAppNotificationsRef,
			where('parentId', '==', statementId),
			where('userId', '==', user.uid),
		);

		const snapshot = await getDocs(q);
		snapshot.forEach((ntf) => {
			deleteDoc(ntf.ref);
		});
	} catch (error) {
		console.error('In clearInAppNotifications', error.message);
	}
}

// ✅ Mark single notification as read in Firestore and Redux
export async function markNotificationAsReadDB(notificationId: string): Promise<void> {
	try {
		const user = store.getState().creator.creator;
		if (!user) {
			console.error('markNotificationAsReadDB: User not found');

			return;
		}

		// Update in Firestore
		const notificationRef = doc(DB, Collections.inAppNotifications, notificationId);
		await updateDoc(notificationRef, {
			read: true,
			readAt: Date.now(),
		});

		// Update in Redux
		store.dispatch(markNotificationAsRead(notificationId));
	} catch (error) {
		console.error('In markNotificationAsReadDB', error.message);
	}
}

// ✅ Mark multiple notifications as read in Firestore and Redux
export async function markMultipleNotificationsAsReadDB(notificationIds: string[]): Promise<void> {
	try {
		const user = store.getState().creator.creator;
		if (!user || !notificationIds.length) {
			console.error('markMultipleNotificationsAsReadDB: User not found or no notification IDs');

			return;
		}

		// Batch update in Firestore
		const batch = writeBatch(DB);
		const now = Date.now();
		notificationIds.forEach((notificationId) => {
			const notificationRef = doc(DB, Collections.inAppNotifications, notificationId);
			batch.update(notificationRef, {
				read: true,
				readAt: now,
			});
		});
		await batch.commit();

		// Update in Redux
		store.dispatch(markNotificationsAsRead(notificationIds));
	} catch (error) {
		console.error('In markMultipleNotificationsAsReadDB', error.message);
	}
}

// ✅ Mark all notifications for a statement as read
export async function markStatementNotificationsAsReadDB(statementId: string): Promise<void> {
	try {
		const user = store.getState().creator.creator;
		if (!user || !statementId) {
			console.error('markStatementNotificationsAsReadDB: User not found or no statement ID');

			return;
		}

		// Query notifications for this statement
		const notificationsRef = collection(DB, Collections.inAppNotifications);
		const q = query(
			notificationsRef,
			where('userId', '==', user.uid),
			where('parentId', '==', statementId),
			where('read', '==', false),
		);

		const snapshot = await getDocs(q);

		if (!snapshot.empty) {
			// Batch update in Firestore
			const batch = writeBatch(DB);
			const now = Date.now();
			snapshot.forEach((docSnapshot) => {
				batch.update(docSnapshot.ref, {
					read: true,
					readAt: now,
					viewedInContext: true,
				});
			});
			await batch.commit();

			// Update in Redux
			store.dispatch(markStatementNotificationsAsRead(statementId));
		}
	} catch (error) {
		console.error('In markStatementNotificationsAsReadDB', error.message);
	}
}

// ✅ Mark notifications as viewed in list (not fully read)
export async function markNotificationsAsViewedInListDB(notificationIds: string[]): Promise<void> {
	try {
		const user = store.getState().creator.creator;
		if (!user || !notificationIds.length) {
			console.error('markNotificationsAsViewedInListDB: User not found or no notification IDs');

			return;
		}

		// Batch update in Firestore
		const batch = writeBatch(DB);
		notificationIds.forEach((notificationId) => {
			const notificationRef = doc(DB, Collections.inAppNotifications, notificationId);
			batch.update(notificationRef, {
				viewedInList: true,
			});
		});
		await batch.commit();
	} catch (error) {
		console.error('In markNotificationsAsViewedInListDB', error.message);
	}
}
