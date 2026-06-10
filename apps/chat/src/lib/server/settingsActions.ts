/**
 * Server-side notification-settings persistence (admin SDK). The per-user,
 * app-agnostic `notificationSettings/{uid}` doc is the home for the master mute,
 * per-channel switches, quiet hours, and digest cadence. Per-discussion
 * overrides stay on `statementsSubscribe`.
 */
import {
	Collections,
	createDefaultNotificationSettings,
	type NotificationSettings,
} from '@freedi/shared-types';
import { adminDb } from './firebaseAdmin';
import type { SessionUser } from './writeActions';

/** Fields the client is allowed to update (everything except identity/timestamps). */
export type NotificationSettingsPatch = Partial<
	Omit<NotificationSettings, 'userId' | 'createdAt' | 'lastUpdate'>
>;

/** Read the user's settings, returning sensible defaults if none exist yet. */
export async function getNotificationSettings(
	user: SessionUser,
	timezone = 'UTC',
): Promise<NotificationSettings> {
	const snap = await adminDb.collection(Collections.notificationSettings).doc(user.uid).get();

	if (snap.exists) return snap.data() as NotificationSettings;

	return createDefaultNotificationSettings(user.uid, Date.now(), timezone);
}

/** Upsert the user's settings (merge). Seeds defaults on first write. */
export async function updateNotificationSettings(
	user: SessionUser,
	patch: NotificationSettingsPatch,
): Promise<NotificationSettings> {
	const ref = adminDb.collection(Collections.notificationSettings).doc(user.uid);
	const snap = await ref.get();
	const now = Date.now();

	const base: NotificationSettings = snap.exists
		? (snap.data() as NotificationSettings)
		: createDefaultNotificationSettings(user.uid, now);

	const next: NotificationSettings = {
		...base,
		...patch,
		userId: user.uid,
		createdAt: base.createdAt ?? now,
		lastUpdate: now,
	};

	await ref.set(next, { merge: true });

	return next;
}
