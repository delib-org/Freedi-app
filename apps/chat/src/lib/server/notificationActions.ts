/**
 * Server-side in-app notification actions (admin SDK). The browser reads its own
 * notifications live via `onSnapshot` (rules allow a user to read their own —
 * see firestore.rules `inAppNotifications`), but all WRITES go through here with
 * the admin SDK, consistent with the rest of chat (`writeActions.ts`,
 * `pushActions.ts`).
 *
 * Data model (shared with the main app + `fn_statementCreation`): each reply to a
 * followed question writes `inAppNotifications/{uid}_{statementId}` with the
 * `NotificationType` shape. We only ever flip `read`/`readAt` here.
 */
import { Collections, type NotificationType } from '@freedi/shared-types';
import { adminDb } from './firebaseAdmin';
import type { SessionUser } from './writeActions';

/** Firestore caps a single batch at 500 writes. */
const BATCH_SIZE = 500;

/** How many recent notifications the SSR first-paint / list reads. */
const LIST_LIMIT = 50;

/** Most recent notifications for the user (newest first), for SSR first paint. */
export async function getNotifications(user: SessionUser): Promise<NotificationType[]> {
	const snapshot = await adminDb
		.collection(Collections.inAppNotifications)
		.where('userId', '==', user.uid)
		.orderBy('createdAt', 'desc')
		.limit(LIST_LIMIT)
		.get();

	return snapshot.docs.map((doc) => doc.data() as NotificationType);
}

/** Count of unread notifications for the user (for the bell badge on first paint). */
export async function getUnreadCount(user: SessionUser): Promise<number> {
	const snapshot = await adminDb
		.collection(Collections.inAppNotifications)
		.where('userId', '==', user.uid)
		.where('read', '==', false)
		.count()
		.get();

	return snapshot.data().count;
}

/** Mark specific notifications read. Verifies ownership before writing. */
export async function markRead(user: SessionUser, notificationIds: string[]): Promise<number> {
	if (notificationIds.length === 0) return 0;

	const now = Date.now();
	let batch = adminDb.batch();
	let pending = 0;
	let written = 0;
	const commits: Promise<unknown>[] = [];

	for (const id of notificationIds) {
		const ref = adminDb.collection(Collections.inAppNotifications).doc(id);
		const snap = await ref.get();
		// Ownership guard: never let one user mark another's notifications read.
		if (!snap.exists || snap.data()?.userId !== user.uid) continue;

		batch.update(ref, { read: true, readAt: now });
		pending++;
		written++;
		if (pending === BATCH_SIZE) {
			commits.push(batch.commit());
			batch = adminDb.batch();
			pending = 0;
		}
	}
	if (pending > 0) commits.push(batch.commit());
	await Promise.all(commits);

	return written;
}

/** Mark every unread notification for the user read. */
export async function markAllRead(user: SessionUser): Promise<number> {
	const snapshot = await adminDb
		.collection(Collections.inAppNotifications)
		.where('userId', '==', user.uid)
		.where('read', '==', false)
		.get();

	if (snapshot.empty) return 0;

	const now = Date.now();
	let batch = adminDb.batch();
	let pending = 0;
	let written = 0;
	const commits: Promise<unknown>[] = [];

	for (const docSnap of snapshot.docs) {
		batch.update(docSnap.ref, { read: true, readAt: now });
		pending++;
		written++;
		if (pending === BATCH_SIZE) {
			commits.push(batch.commit());
			batch = adminDb.batch();
			pending = 0;
		}
	}
	if (pending > 0) commits.push(batch.commit());
	await Promise.all(commits);

	return written;
}
