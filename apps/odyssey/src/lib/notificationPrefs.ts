import {
	Collections,
	ODYSSEY_DIGEST_MAX_HOURS,
	SourceApp,
	createDefaultNotificationSettings,
	type NotificationSettings,
	type OdysseyDigestSettings,
} from '@freedi/shared-types';
import { db, doc, getDoc, setDoc } from './firebase';

/**
 * The player's voyage-story email cadence, stored on the cross-app
 * `notificationSettings/{uid}` doc. Saving a cadence is the explicit opt-in:
 * it also flips the odyssey per-app email channel on, overriding the
 * conservative email-off default the settings are created with.
 */

export const DIGEST_TIMEZONE_DEFAULT = 'Asia/Jerusalem';
export { ODYSSEY_DIGEST_MAX_HOURS };

export async function loadDigestSettings(uid: string): Promise<OdysseyDigestSettings | null> {
	const snap = await getDoc(doc(db, Collections.notificationSettings, uid));
	if (!snap.exists()) return null;

	return (snap.data() as NotificationSettings).odysseyDigest ?? null;
}

export async function saveDigestSettings(
	uid: string,
	cadence: OdysseyDigestSettings,
): Promise<void> {
	const ref = doc(db, Collections.notificationSettings, uid);
	const snap = await getDoc(ref);
	const now = Date.now();
	const base = snap.exists()
		? (snap.data() as NotificationSettings)
		: createDefaultNotificationSettings(uid, now, cadence.timezone);

	const next: NotificationSettings = {
		...base,
		odysseyDigest: {
			...cadence,
			hoursLocal: [...new Set(cadence.hoursLocal)]
				.sort((a, b) => a - b)
				.slice(0, ODYSSEY_DIGEST_MAX_HOURS),
		},
		perApp: {
			...base.perApp,
			[SourceApp.ODYSSEY]: {
				muted: false,
				channels: {
					...(base.perApp?.[SourceApp.ODYSSEY]?.channels ?? {
						push: false,
						inApp: true,
						email: false,
					}),
					email: cadence.enabled,
				},
			},
		},
		lastUpdate: now,
	};

	await setDoc(ref, next);
}
