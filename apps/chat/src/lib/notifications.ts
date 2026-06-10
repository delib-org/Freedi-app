/**
 * In-app notification live listener + mark-read client. `onMount`-only: lazily
 * imports `firebase/firestore` and opens an authenticated `onSnapshot` on the
 * user's own `inAppNotifications` (rules allow reading your own). Patches the
 * store on added/modified/removed. Mirrors `realtime.ts`.
 *
 * Reads are live and client-side; WRITES (mark read) go through `/api/notifications`
 * (admin SDK) to keep chat's "all writes server-side" invariant.
 */
import { Collections, type NotificationType } from '@freedi/shared-types';
import { firestoreAuthed } from './firebaseClient';
import {
	removeNotifications,
	setNotifications,
	upsertNotifications,
	markReadLocally,
	markAllReadLocally,
	unreadIds,
} from './stores/notifications';

/** How many recent notifications to keep live (matches the server list limit). */
const LIMIT = 50;

/**
 * Start listening to the signed-in user's notifications. Optionally seed the
 * store first (SSR first paint) so the bell badge is correct before the snapshot
 * resolves. Returns an unsubscribe.
 */
export function subscribeToNotifications(uid: string, seed?: NotificationType[]): () => void {
	if (seed && seed.length) setNotifications(seed);

	let unsub: (() => void) | null = null;
	let cancelled = false;

	(async () => {
		try {
			const { db } = await firestoreAuthed();
			const { collection, query, where, orderBy, limit, onSnapshot } = await import(
				'firebase/firestore'
			);
			const q = query(
				collection(db, Collections.inAppNotifications),
				where('userId', '==', uid),
				orderBy('createdAt', 'desc'),
				limit(LIMIT),
			);

			const stop = onSnapshot(q, (snap) => {
				const changed: NotificationType[] = [];
				const removed: string[] = [];
				for (const change of snap.docChanges()) {
					const data = change.doc.data() as NotificationType;
					if (change.type === 'removed') removed.push(data.notificationId);
					else changed.push(data);
				}
				upsertNotifications(changed);
				removeNotifications(removed);
			});

			if (cancelled) stop();
			else unsub = stop;
		} catch (e) {
			console.error('[chat] notifications subscribe failed:', e instanceof Error ? e.message : e);
		}
	})();

	return () => {
		cancelled = true;
		if (unsub) unsub();
	};
}

async function postNotifications(body: Record<string, unknown>): Promise<boolean> {
	try {
		const res = await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});

		return res.ok;
	} catch {
		return false;
	}
}

/** Mark specific notifications read (optimistic, then server-confirmed). */
export async function markNotificationsRead(ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	markReadLocally(ids);
	await postNotifications({ action: 'markRead', ids });
}

/** Mark every notification read (optimistic, then server-confirmed). */
export async function markAllNotificationsRead(): Promise<void> {
	const ids = unreadIds();
	if (ids.length === 0) return;
	markAllReadLocally();
	await postNotifications({ action: 'markAllRead' });
}
