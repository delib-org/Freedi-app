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
	Statement,
	StatementSubscription,
	StatementType,
	type NotificationQueueItem,
	type NotificationSettings,
} from '@freedi/shared-types';
import type { Firestore } from 'firebase-admin/firestore';
import { ancestorIds } from '../utils/statementAncestors';
import { expectedSubscriptionId, genuineSubscriberUid } from '../utils/subscriptionIdentity';

const TOP = 'top';

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

/** Where a statement sits in the tree, and whether it is an answer. */
export type StatementLevels = Pick<
	Statement,
	'statementId' | 'parentId' | 'parents' | 'topParentId'
> &
	Partial<Pick<Statement, 'statementType'>>;

/** The question an answer belongs to; undefined for anything but an answer. */
function questionOfAnswer(statement: StatementLevels): string | undefined {
	return statement.statementType === StatementType.option && statement.parentId !== TOP
		? statement.parentId
		: undefined;
}

/**
 * The people shut out of `statement` from above it. A ban at any level counts
 * (see `resolveQuestionParticipation`). Waiting and unsubscribed count only on
 * the question of an answer, because an answer is part of its question: someone
 * can be waiting on a closed group and still belong to an open question inside
 * it. One query per level, billed per doc found, so a tree with nobody blocked
 * costs one read per level. Only a doc whose id agrees with its fields counts:
 * anything else could silence someone it does not belong to.
 */
export async function loadBlockedAbove(
	db: Firestore,
	statement: StatementLevels,
): Promise<Set<string>> {
	const levels = ancestorIds(statement);
	const question = questionOfAnswer(statement);
	const subscriptions = db.collection(Collections.statementsSubscribe);
	const snaps = await Promise.all(
		levels.map((id) =>
			subscriptions
				.where('statementId', '==', id)
				.where('role', 'in', id === question ? [...EXCLUDED_SUBSCRIBER_ROLES] : [Role.banned])
				.get(),
		),
	);

	const blocked = new Set<string>();
	snaps.forEach((snap, index) => {
		snap.docs.forEach((doc) => {
			const uid = genuineSubscriberUid(doc.id, doc.data() as StatementSubscription, levels[index]);
			if (uid) blocked.add(uid);
		});
	});

	return blocked;
}

/**
 * Whether a queued notice must be dropped because its recipient lost their place
 * after it was written, by the same rule as the fan-out: the full exclusion list
 * on the statement the notice is about (and, for an answer, on its question), a
 * ban anywhere above. One read of the statement for its true place in the tree,
 * then one read per level.
 */
export async function isRecipientExcluded(
	db: Firestore,
	uid: string,
	item: Pick<NotificationQueueItem, 'statementId' | 'parentId' | 'topParentId'>,
): Promise<boolean> {
	const { statementId } = item;
	if (!statementId || statementId === TOP) return false;

	const statementSnap = await db.collection(Collections.statements).doc(statementId).get();
	// A statement deleted since the item was written: the item still says where it sat.
	const statement: StatementLevels = (statementSnap.data() as Statement | undefined) ?? {
		statementId,
		parentId: item.parentId ?? TOP,
		topParentId: item.topParentId ?? TOP,
	};
	const question = questionOfAnswer(statement);
	const levels = [statementId, ...ancestorIds(statement)];

	const subscriptions = db.collection(Collections.statementsSubscribe);
	const snaps = await db.getAll(
		...levels.map((id) => subscriptions.doc(expectedSubscriptionId(uid, id))),
	);

	return snaps.some((snap, index) => {
		const role = (snap.data() as StatementSubscription | undefined)?.role;
		if (!role) return false;
		const isOwnLevel = levels[index] === statementId || levels[index] === question;

		return isOwnLevel ? EXCLUDED_SUBSCRIBER_ROLES.includes(role) : role === Role.banned;
	});
}

/**
 * Everyone who may hear about `statementId` on any channel, merged by uid so a
 * user subscribed on several channels is resolved once. An excluded role leaves
 * the person out. Given the `statement` itself, so does being shut out above it
 * (`loadBlockedAbove`).
 */
export async function loadSubscribers(
	db: Firestore,
	statementId: string,
	statement?: StatementLevels,
): Promise<Map<string, SubscriberChannels>> {
	const subscriptions = db
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', statementId);
	const [inAppSnap, pushSnap, emailSnap, blockedUids] = await Promise.all([
		subscriptions.where('getInAppNotification', '==', true).get(),
		subscriptions.where('getPushNotification', '==', true).get(),
		subscriptions.where('getEmailNotification', '==', true).get(),
		statement ? loadBlockedAbove(db, statement) : new Set<string>(),
	]);

	// Worked out before merging: the doc at the person's real id decides, so an
	// old copy of the same subscription cannot let a banned person back in.
	[inAppSnap, pushSnap, emailSnap].forEach((snap) => {
		snap.docs.forEach((doc) => {
			const sub = doc.data() as StatementSubscription;
			if (!EXCLUDED_SUBSCRIBER_ROLES.includes(sub.role)) return;
			const owner = genuineSubscriberUid(doc.id, sub, statementId);
			if (owner) blockedUids.add(owner);
		});
	});

	const byUid = new Map<string, SubscriberChannels>();
	const upsert = (sub: StatementSubscription, key: 'inApp' | 'push' | 'email'): void => {
		// By `userId`, the field the doc id is built from: on server copies `user`
		// holds someone else, who must not be shut out by this doc.
		if (EXCLUDED_SUBSCRIBER_ROLES.includes(sub.role) || blockedUids.has(sub.userId)) return;

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
