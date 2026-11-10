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
	setNotificationFeedOwner,
	markNotificationAsRead,
	markNotificationsAsRead,
	markStatementNotificationsAsRead,
	markAllNotificationsAsRead,
	clearAllInAppNotifications,
} from '@/redux/notificationsSlice/notificationsSlice';
import { logError } from '@/utils/errorHandling';
import { NOTIFICATION } from '@/constants/common';

// Filters out Firestore write errors that are expected and not actionable:
// - permission-denied: happens during sign-out before listeners unmount
// - IndexedDB/unavailable: flaky mobile browsers, private mode, multi-tab
//   schema upgrades (Samsung Internet, Firefox private, etc.)
function isIgnorableFirestoreWriteError(error: unknown): boolean {
	const firebaseError = error as { code?: string; name?: string };
	const errorMessage = error instanceof Error ? error.message : String(error);

	return (
		firebaseError.code === 'permission-denied' ||
		firebaseError.code === 'unavailable' ||
		firebaseError.name === 'IndexedDbTransactionError' ||
		errorMessage.includes('Missing or insufficient permissions') ||
		errorMessage.includes('IndexedDB') ||
		errorMessage.includes('indexedDB')
	);
}

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

		// Unread records, newest first and bounded: someone behind on a large
		// question could otherwise download one document per answer on every open.
		// The badge needs no more than this to read "99+", and as records are read
		// the next ones arrive. Needs the (userId, read, createdAt desc) index.
		const unreadQuery = query(
			inAppNotificationsRef,
			where('userId', '==', user.uid),
			where('read', '==', false),
			orderBy('createdAt', 'desc'),
			limit(NOTIFICATION.UNREAD_LISTENER_LIMIT),
		);
		const snapshots = new Map<string, NotificationType[]>();
		let disposed = false;
		const publishWhenBothArrived = (): void => {
			if (snapshots.size < 2) return;
			const combined = new Map<string, NotificationType>();
			// A read from the history takes precedence over a pending unread snapshot.
			for (const record of [...(snapshots.get('unread') || []), ...(snapshots.get('recent') || [])])
				combined.set(record.notificationId, record);
			store.dispatch(
				setInAppNotificationsAll([...combined.values()].sort((a, b) => b.createdAt - a.createdAt)),
			);
			store.dispatch(setNotificationFeedOwner(user.uid));
		};
		const subscribe = (source: string, notificationQuery: typeof q): Unsubscribe =>
			onSnapshot(
				notificationQuery,
				(snapshot) => {
					if (disposed || store.getState().creator.creator?.uid !== user.uid) return;
					const records = snapshot.docs.map((record) => {
						const data = record.data();

						return {
							...data,
							notificationId: record.id,
							readAt: data.readAt?.toMillis ? data.readAt.toMillis() : data.readAt,
							createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt,
						} as NotificationType;
					});
					snapshots.set(source, records);
					publishWhenBothArrived();
				},
				(error) => {
					if (disposed || store.getState().creator.creator?.uid !== user.uid) return;
					if (error.code === 'permission-denied') return;
					logError(error, { operation: 'inAppNotifications.listen', metadata: { source } });
					// If the unread index is not ready, the history must still show.
					if (source === 'unread') {
						snapshots.set(source, []);
						publishWhenBothArrived();
					}
				},
			);
		const unsubscribers = [subscribe('recent', q), subscribe('unread', unreadQuery)];

		return () => {
			disposed = true;
			unsubscribers.forEach((unsubscribe) => unsubscribe());
		};
	} catch (error) {
		logError(error, {
			operation: 'inAppNotifications.db_inAppNotifications.listenToInAppNotifications',
		});

		return () => {
			return;
		};
	}
}

export async function clearInAppNotifications(statementId: string) {
	try {
		if (!statementId) {
			logError(new Error('clearInAppNotifications: statementId is required'), {
				operation: 'inAppNotifications.db_inAppNotifications.clearInAppNotifications',
			});

			return;
		}

		const user = store.getState().creator.creator;
		if (!user) {
			logError(new Error('clearInAppNotifications: User not found'), {
				operation: 'inAppNotifications.db_inAppNotifications.clearInAppNotifications',
			});

			return;
		}

		const inAppNotificationsRef = collection(DB, Collections.inAppNotifications);
		const q = query(
			inAppNotificationsRef,
			where('parentId', '==', statementId),
			where('userId', '==', user.uid),
		);

		const snapshot = await getDocs(q);
		const deletePromises = snapshot.docs.map((ntf) =>
			deleteDoc(ntf.ref).catch(() => {
				// Ignore errors from already-deleted documents
			}),
		);
		await Promise.all(deletePromises);
	} catch (error: unknown) {
		if (isIgnorableFirestoreWriteError(error)) return;

		logError(error, {
			operation: 'inAppNotifications.db_inAppNotifications.clearInAppNotifications',
			metadata: {
				detail: error instanceof Error ? error.message : String(error),
			},
		});
	}
}

// ✅ Mark single notification as read in Firestore and Redux
export async function markNotificationAsReadDB(notificationId: string): Promise<void> {
	try {
		const user = store.getState().creator.creator;
		if (!user) {
			logError(new Error('markNotificationAsReadDB: User not found'), {
				operation: 'inAppNotifications.db_inAppNotifications.markNotificationAsReadDB',
			});

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
	} catch (error: unknown) {
		if (isIgnorableFirestoreWriteError(error)) return;

		logError(new Error('In markNotificationAsReadDB'), {
			operation: 'inAppNotifications.db_inAppNotifications.markNotificationAsReadDB',
			metadata: {
				detail: error instanceof Error ? error.message : String(error),
			},
		});
	}
}

// ✅ Mark multiple notifications as read in Firestore and Redux
export async function markMultipleNotificationsAsReadDB(notificationIds: string[]): Promise<void> {
	try {
		const user = store.getState().creator.creator;
		if (!user || !notificationIds.length) {
			logError(
				new Error('markMultipleNotificationsAsReadDB: User not found or no notification IDs'),
				{ operation: 'inAppNotifications.db_inAppNotifications.markMultipleNotificationsAsReadDB' },
			);

			return;
		}

		const uniqueIds = [...new Set(notificationIds)];
		for (let offset = 0; offset < uniqueIds.length; offset += NOTIFICATION.MARK_READ_BATCH_SIZE) {
			const ids = uniqueIds.slice(offset, offset + NOTIFICATION.MARK_READ_BATCH_SIZE);
			const batch = writeBatch(DB);
			const now = Date.now();
			ids.forEach((id) =>
				batch.update(doc(DB, Collections.inAppNotifications, id), { read: true, readAt: now }),
			);
			await batch.commit();
			store.dispatch(markNotificationsAsRead(ids));
		}
	} catch (error: unknown) {
		if (isIgnorableFirestoreWriteError(error)) return;

		logError(new Error('In markMultipleNotificationsAsReadDB'), {
			operation: 'inAppNotifications.db_inAppNotifications.markMultipleNotificationsAsReadDB',
			metadata: {
				detail: error instanceof Error ? error.message : String(error),
			},
		});
	}
}

/**
 * Marks everything unread as read, page by page from the server. The Redux feed
 * holds only a bounded slice, so its ids would clear part of a long backlog.
 */
export async function markAllUnreadNotificationsAsReadDB(): Promise<void> {
	const user = store.getState().creator.creator;

	try {
		if (!user) return;

		store.dispatch(markAllNotificationsAsRead());

		const unreadPage = query(
			collection(DB, Collections.inAppNotifications),
			where('userId', '==', user.uid),
			where('read', '==', false),
			limit(NOTIFICATION.MARK_READ_BATCH_SIZE),
		);

		let page = await getDocs(unreadPage);
		while (!page.empty) {
			const batch = writeBatch(DB);
			const now = Date.now();
			page.docs.forEach((record) => batch.update(record.ref, { read: true, readAt: now }));
			await batch.commit();
			if (page.size < NOTIFICATION.MARK_READ_BATCH_SIZE) return;
			page = await getDocs(unreadPage);
		}
	} catch (error: unknown) {
		if (isIgnorableFirestoreWriteError(error)) return;

		logError(error, {
			operation: 'inAppNotifications.db_inAppNotifications.markAllUnreadNotificationsAsReadDB',
			userId: user?.uid,
		});
	}
}

// ✅ Mark all notifications for a statement as read
export async function markStatementNotificationsAsReadDB(statementId: string): Promise<void> {
	try {
		const user = store.getState().creator.creator;
		if (!user || !statementId) {
			logError(new Error('markStatementNotificationsAsReadDB: User not found or no statement ID'), {
				operation: 'inAppNotifications.db_inAppNotifications.markStatementNotificationsAsReadDB',
			});

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
			// A question can hold more unread answers than one batch accepts.
			const now = Date.now();
			const docs = snapshot.docs;
			for (let offset = 0; offset < docs.length; offset += NOTIFICATION.MARK_READ_BATCH_SIZE) {
				const batch = writeBatch(DB);
				docs.slice(offset, offset + NOTIFICATION.MARK_READ_BATCH_SIZE).forEach((docSnapshot) => {
					batch.update(docSnapshot.ref, {
						read: true,
						readAt: now,
						viewedInContext: true,
					});
				});
				await batch.commit();
			}

			// Update in Redux
			store.dispatch(markStatementNotificationsAsRead(statementId));
		}
	} catch (error: unknown) {
		if (isIgnorableFirestoreWriteError(error)) return;

		logError(new Error('In markStatementNotificationsAsReadDB'), {
			operation: 'inAppNotifications.db_inAppNotifications.markStatementNotificationsAsReadDB',
			metadata: {
				detail: error instanceof Error ? error.message : String(error),
			},
		});
	}
}

// ✅ Mark notifications as viewed in list (not fully read)
export async function markNotificationsAsViewedInListDB(notificationIds: string[]): Promise<void> {
	try {
		const user = store.getState().creator.creator;
		if (!user || !notificationIds.length) {
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
	} catch (error: unknown) {
		if (isIgnorableFirestoreWriteError(error)) return;

		logError(error, {
			operation: 'inAppNotifications.db_inAppNotifications.markNotificationsAsViewedInListDB',
			metadata: {
				detail: error instanceof Error ? error.message : String(error),
			},
		});
	}
}

// Clear all notifications for the current user from Firestore and Redux
export async function clearAllInAppNotificationsDB(): Promise<void> {
	try {
		const user = store.getState().creator.creator;
		if (!user) {
			logError(new Error('clearAllInAppNotificationsDB: User not found'), {
				operation: 'inAppNotifications.db_inAppNotifications.clearAllInAppNotificationsDB',
			});

			return;
		}

		// Clear from Redux immediately so UI updates right away
		store.dispatch(clearAllInAppNotifications());

		const inAppNotificationsRef = collection(DB, Collections.inAppNotifications);
		const q = query(inAppNotificationsRef, where('userId', '==', user.uid));

		const snapshot = await getDocs(q);

		if (snapshot.empty) return;

		// Delete in batches of 500 (Firestore limit)
		const batchSize = 500;
		const docs = snapshot.docs;

		for (let i = 0; i < docs.length; i += batchSize) {
			const batch = writeBatch(DB);
			const chunk = docs.slice(i, i + batchSize);
			chunk.forEach((docSnapshot) => {
				batch.delete(docSnapshot.ref);
			});
			await batch.commit();
		}
	} catch (error: unknown) {
		if (isIgnorableFirestoreWriteError(error)) return;

		logError(error, {
			operation: 'inAppNotifications.db_inAppNotifications.clearAllInAppNotificationsDB',
			userId: store.getState().creator.creator?.uid,
		});
	}
}
