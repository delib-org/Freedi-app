/**
 * What the server knows about the people a notice is for: whether they accept
 * it, and any language stored for them. Unset preferences mean on.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { Collections, NotificationFrequency, SourceApp } from '@freedi/shared-types';
import type { NotificationSettings, User } from '@freedi/shared-types';

export interface NoticeAudience {
	/** Master mute, per-app mute, "Off" frequency and the in-app switches all allow it. */
	inAppOn: boolean;
	/** The "Updates about my answers" preference. */
	answerUpdatesOn: boolean;
	storedLanguage?: string;
}

const AUDIENCE_READ_CHUNK = 100;

function toAudience(
	settings: NotificationSettings | undefined,
	user: User | undefined,
	sourceApp: SourceApp,
): NoticeAudience {
	const perApp = settings?.perApp?.[sourceApp];
	const inAppOn =
		settings?.muted !== true &&
		perApp?.muted !== true &&
		settings?.defaultFrequency !== NotificationFrequency.NONE &&
		(settings?.defaultChannels?.inApp ?? true) &&
		(perApp?.channels?.inApp ?? true);

	return {
		inAppOn,
		answerUpdatesOn: settings?.answerUpdates !== false,
		storedLanguage: user?.defaultLanguage,
	};
}

/** Loads the preferences and stored language of each uid. Reads two documents per person. */
export async function readNoticeAudiences(
	db: Firestore,
	uids: string[],
	sourceApp: SourceApp = SourceApp.MAIN,
): Promise<Map<string, NoticeAudience>> {
	const audiences = new Map<string, NoticeAudience>();

	for (let start = 0; start < uids.length; start += AUDIENCE_READ_CHUNK) {
		const chunk = uids.slice(start, start + AUDIENCE_READ_CHUNK);
		const snaps = await db.getAll(
			...chunk.map((uid) => db.collection(Collections.notificationSettings).doc(uid)),
			...chunk.map((uid) => db.collection(Collections.users).doc(uid)),
		);
		chunk.forEach((uid, i) => {
			const settings = snaps[i].data() as NotificationSettings | undefined;
			const user = snaps[i + chunk.length].data() as User | undefined;
			audiences.set(uid, toAudience(settings, user, sourceApp));
		});
	}

	return audiences;
}
