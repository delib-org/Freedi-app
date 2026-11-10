/**
 * Who follows a statement, and how each of them wants to hear about it. Shared
 * by the instant fan-out and the large-question digest so both honour the same
 * mutes, snoozes, frequencies and channel switches.
 */
import {
	Collections,
	NotificationFrequency,
	Role,
	SourceApp,
	StatementSubscription,
	type NotificationSettings,
} from '@freedi/shared-types';
import type { Firestore } from 'firebase-admin/firestore';

/** People who must not receive anything about a question they are not part of. */
export const EXCLUDED_SUBSCRIBER_ROLES: readonly Role[] = [
	Role.banned,
	Role.unsubscribed,
	Role.waiting,
];

export interface SubscriberChannels {
	sub: StatementSubscription;
	inApp: boolean;
	push: boolean;
	email: boolean;
}

export interface DeliveryDecision {
	deliver: boolean;
	frequency: NotificationFrequency;
	inApp: boolean;
	push: boolean;
	email: boolean;
}

const SKIP: DeliveryDecision = {
	deliver: false,
	frequency: NotificationFrequency.NONE,
	inApp: false,
	push: false,
	email: false,
};

/** Resolve whether/where to deliver for one user, from their settings + subscription. */
export function resolveDelivery(
	settings: NotificationSettings | null,
	channels: SubscriberChannels,
	sourceApp: SourceApp | undefined,
	now: number,
): DeliveryDecision {
	// Master mute.
	if (settings?.muted) return SKIP;

	// Per-app mute.
	const perApp = sourceApp ? settings?.perApp?.[sourceApp] : undefined;
	if (perApp?.muted) return SKIP;

	// Per-discussion snooze.
	if (channels.sub.mutedUntil && channels.sub.mutedUntil > now) return SKIP;

	// Effective frequency: subscription overrides user default; default INSTANT.
	const frequency =
		channels.sub.notificationFrequency ??
		settings?.defaultFrequency ??
		NotificationFrequency.INSTANT;
	if (frequency === NotificationFrequency.NONE) return SKIP;

	// Channel switches (user-global, then per-app). Default on when unset.
	const inAppAllowed =
		(settings?.defaultChannels?.inApp ?? true) && (perApp?.channels?.inApp ?? true);
	const pushAllowed = (settings?.defaultChannels?.push ?? true) && (perApp?.channels?.push ?? true);
	const emailAllowed =
		(settings?.defaultChannels?.email ?? false) && (perApp?.channels?.email ?? true);

	return {
		deliver: true,
		frequency,
		inApp: channels.inApp && inAppAllowed,
		push: channels.push && pushAllowed,
		email: channels.email && emailAllowed,
	};
}

/** Batch-load per-user notification settings, deduped by uid. */
export async function loadSettings(
	db: Firestore,
	uids: string[],
): Promise<Map<string, NotificationSettings | null>> {
	const map = new Map<string, NotificationSettings | null>();
	if (uids.length === 0) return map;

	const refs = uids.map((uid) => db.collection(Collections.notificationSettings).doc(uid));
	const snaps = await db.getAll(...refs);
	snaps.forEach((snap, i) => {
		map.set(uids[i], snap.exists ? (snap.data() as NotificationSettings) : null);
	});

	return map;
}

/**
 * Everyone subscribed to `statementId` on any channel, merged by uid so a user
 * subscribed on several channels is resolved once.
 */
export async function loadSubscribers(
	db: Firestore,
	statementId: string,
): Promise<Map<string, SubscriberChannels>> {
	const subscriptions = db
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', statementId);
	const [inAppSnap, pushSnap, emailSnap] = await Promise.all([
		subscriptions.where('getInAppNotification', '==', true).get(),
		subscriptions.where('getPushNotification', '==', true).get(),
		subscriptions.where('getEmailNotification', '==', true).get(),
	]);

	const byUid = new Map<string, SubscriberChannels>();
	const upsert = (sub: StatementSubscription, key: 'inApp' | 'push' | 'email'): void => {
		const uid = sub.user?.uid ?? sub.userId;
		if (!uid) return;
		const existing = byUid.get(uid);
		if (existing) {
			existing[key] = true;
			if (key === 'push') existing.sub = sub; // prefer the doc carrying tokens
		} else {
			byUid.set(uid, {
				sub,
				inApp: key === 'inApp',
				push: key === 'push',
				email: key === 'email',
			});
		}
	};
	inAppSnap.docs.forEach((d) => upsert(d.data() as StatementSubscription, 'inApp'));
	pushSnap.docs.forEach((d) => upsert(d.data() as StatementSubscription, 'push'));
	emailSnap.docs.forEach((d) => upsert(d.data() as StatementSubscription, 'email'));

	return byUid;
}
