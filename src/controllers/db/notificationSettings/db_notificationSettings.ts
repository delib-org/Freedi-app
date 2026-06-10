/**
 * Per-user global notification settings (`notificationSettings/{uid}`). This is
 * the app-agnostic home for the master mute, per-channel switches, quiet hours,
 * and digest cadence — shared with chat and the notification Cloud Functions.
 * Per-discussion overrides continue to live on `statementsSubscribe`.
 *
 * Client-side reads/writes are allowed by the `notificationSettings` rule (the
 * doc id is the uid). Uses the Firebase utilities per project conventions.
 */
import { getDoc, setDoc } from 'firebase/firestore';
import {
	Collections,
	createDefaultNotificationSettings,
	NotificationSettingsSchema,
	type NotificationSettings,
} from '@freedi/shared-types';
import { parse } from 'valibot';
import { createDocRef } from '@/utils/firebaseUtils';
import { getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

/** Patchable fields (everything except identity/timestamps). */
export type NotificationSettingsPatch = Partial<
	Omit<NotificationSettings, 'userId' | 'createdAt' | 'lastUpdate'>
>;

function browserTimezone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	} catch {
		return 'UTC';
	}
}

/** Read the user's settings, returning validated defaults if none exist yet. */
export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
	try {
		const ref = createDocRef(Collections.notificationSettings, userId);
		const snap = await getDoc(ref);
		if (snap.exists()) {
			return parse(NotificationSettingsSchema, snap.data());
		}
	} catch (error) {
		logError(error, { operation: 'notificationSettings.getNotificationSettings', userId });
	}

	return createDefaultNotificationSettings(userId, getCurrentTimestamp(), browserTimezone());
}

/** Upsert the user's settings (merge). Seeds defaults on first write. */
export async function updateNotificationSettings(
	userId: string,
	patch: NotificationSettingsPatch,
): Promise<NotificationSettings | null> {
	try {
		const ref = createDocRef(Collections.notificationSettings, userId);
		const snap = await getDoc(ref);
		const now = getCurrentTimestamp();
		const base: NotificationSettings = snap.exists()
			? parse(NotificationSettingsSchema, snap.data())
			: createDefaultNotificationSettings(userId, now, browserTimezone());

		const next: NotificationSettings = {
			...base,
			...patch,
			userId,
			createdAt: base.createdAt ?? now,
			lastUpdate: now,
		};
		await setDoc(ref, next, { merge: true });

		return next;
	} catch (error) {
		logError(error, { operation: 'notificationSettings.updateNotificationSettings', userId });

		return null;
	}
}
