/**
 * Server-side web-push persistence (admin SDK). The browser is the only place
 * an FCM token can be minted, so the client sends it here and these helpers do
 * the privileged writes — consistent with the rest of chat, where all writes go
 * through the admin SDK rather than the client (see `writeActions.ts`). Using
 * admin also means per-question follows work for private questions, which the
 * client security rules would block.
 *
 * Data model (shared with the main app + the `fn_notifications` function):
 *  - `pushNotifications/{token}`            — token → user, for token bookkeeping.
 *  - `statementsSubscribe/{uid}--{stId}`    — the function delivers a push to
 *    every such doc with `getPushNotification === true`, to each token in its
 *    `tokens[]` array.
 */
import { FieldValue } from 'firebase-admin/firestore';
import {
	Collections,
	NotificationFrequency,
	Role,
	getStatementSubscriptionId,
	type Statement,
	type SimpleStatement,
} from '@freedi/shared-types';
import { adminDb } from './firebaseAdmin';
import { getStatement } from './conversation';
import type { SessionUser } from './writeActions';

/** Firestore caps a single batch at 500 writes. */
const BATCH_SIZE = 500;

/** A SessionUser is enough to identify the subscriber on the subscription doc. */
function toUser(user: SessionUser) {
	return {
		uid: user.uid,
		displayName: user.displayName ?? user.email ?? 'User',
		email: user.email ?? null,
		photoURL: user.photoURL ?? null,
	};
}

/** Denormalized snapshot of the question stored on the subscription. */
function toSimpleStatement(statement: Statement): SimpleStatement {
	return {
		statementId: statement.statementId,
		statement: statement.statement,
		description: statement.description ?? '',
		statementType: statement.statementType,
		creatorId: statement.creatorId,
		creator: statement.creator,
		parentId: statement.parentId,
		consensus: statement.consensus ?? 0,
		lastUpdate: statement.lastUpdate,
		createdAt: statement.createdAt,
	};
}

/** Store/refresh the token → user mapping in `pushNotifications/{token}`. */
export async function storeToken(user: SessionUser, token: string): Promise<void> {
	await adminDb.collection(Collections.pushNotifications).doc(token).set(
		{
			token,
			userId: user.uid,
			lastUpdate: Date.now(),
			lastRefresh: Date.now(),
			platform: 'web',
		},
		{ merge: true },
	);
}

/**
 * Fan the token out to every push-enabled subscription the user already has, so
 * the existing function delivers to this device. Mirrors the main app's
 * `syncTokenWithSubscriptions`.
 */
export async function syncTokenWithSubscriptions(
	user: SessionUser,
	token: string,
): Promise<number> {
	const snapshot = await adminDb
		.collection(Collections.statementsSubscribe)
		.where('userId', '==', user.uid)
		.where('getPushNotification', '==', true)
		.get();

	let batch = adminDb.batch();
	let count = 0;
	const commits: Promise<unknown>[] = [];

	for (const docSnap of snapshot.docs) {
		batch.update(docSnap.ref, {
			tokens: FieldValue.arrayUnion(token),
			lastTokenUpdate: Date.now(),
		});
		count++;
		if (count % BATCH_SIZE === 0) {
			commits.push(batch.commit());
			batch = adminDb.batch();
		}
	}
	if (count % BATCH_SIZE !== 0) commits.push(batch.commit());

	await Promise.all(commits);

	return count;
}

/** Token registration: store the token and sync it to existing subscriptions. */
export async function registerToken(user: SessionUser, token: string): Promise<number> {
	await storeToken(user, token);

	return syncTokenWithSubscriptions(user, token);
}

/**
 * Follow a question for push: upsert the user's subscription with
 * `getPushNotification: true` and the device token. Idempotent.
 */
export async function followQuestion(
	user: SessionUser,
	statementId: string,
	token: string,
): Promise<void> {
	const statement = await getStatement(statementId);
	if (!statement) throw new Error('Question not found');

	const subId = getStatementSubscriptionId(statementId, toUser(user));
	if (!subId) throw new Error('Could not derive subscription id');

	await storeToken(user, token);

	await adminDb
		.collection(Collections.statementsSubscribe)
		.doc(subId)
		.set(
			{
				statementsSubscribeId: subId,
				statementId,
				userId: user.uid,
				role: Role.member,
				user: toUser(user),
				statement: toSimpleStatement(statement),
				parentId: statement.parentId,
				topParentId: statement.topParentId || statement.parentId,
				statementType: statement.statementType,
				getPushNotification: true,
				getInAppNotification: true,
				tokens: FieldValue.arrayUnion(token),
				lastUpdate: Date.now(),
				createdAt: statement.createdAt ?? Date.now(),
				lastTokenUpdate: Date.now(),
			},
			{ merge: true },
		);
}

/** Stop push for a question. Leaves the subscription doc; just flips the flag. */
export async function unfollowQuestion(
	user: SessionUser,
	statementId: string,
	token?: string,
): Promise<void> {
	const subId = getStatementSubscriptionId(statementId, toUser(user));
	if (!subId) throw new Error('Could not derive subscription id');

	const update: Record<string, unknown> = {
		getPushNotification: false,
		lastUpdate: Date.now(),
	};
	if (token) update.tokens = FieldValue.arrayRemove(token);

	await adminDb.collection(Collections.statementsSubscribe).doc(subId).set(update, { merge: true });
}

/** Whether the user currently follows the question for push. */
export async function getFollowStatus(user: SessionUser, statementId: string): Promise<boolean> {
	const subId = getStatementSubscriptionId(statementId, toUser(user));
	if (!subId) return false;

	const doc = await adminDb.collection(Collections.statementsSubscribe).doc(subId).get();

	return doc.exists && doc.data()?.getPushNotification === true;
}

export type SubscriptionState = 'unsubscribed' | 'instant' | 'daily' | 'weekly' | 'muted';

const STATE_TO_FREQUENCY: Record<
	Exclude<SubscriptionState, 'unsubscribed'>,
	NotificationFrequency
> = {
	instant: NotificationFrequency.INSTANT,
	daily: NotificationFrequency.DAILY,
	weekly: NotificationFrequency.WEEKLY,
	muted: NotificationFrequency.NONE,
};

/**
 * Set the per-question notification frequency (BranchBell). `unsubscribed`
 * stops following (both channels off); `muted` keeps the follow but silences it
 * (frequency NONE); instant/daily/weekly set in-app on and the cadence, with
 * `instant` also enabling push for the passed device token.
 */
export async function setQuestionFrequency(
	user: SessionUser,
	statementId: string,
	state: SubscriptionState,
	token?: string,
): Promise<void> {
	const subId = getStatementSubscriptionId(statementId, toUser(user));
	if (!subId) throw new Error('Could not derive subscription id');
	const ref = adminDb.collection(Collections.statementsSubscribe).doc(subId);

	if (state === 'unsubscribed') {
		await ref.set(
			{ getInAppNotification: false, getPushNotification: false, lastUpdate: Date.now() },
			{ merge: true },
		);

		return;
	}

	// Ensure the subscription doc exists with the question snapshot (first follow).
	const statement = await getStatement(statementId);
	if (!statement) throw new Error('Question not found');

	if (token) await storeToken(user, token);

	const wantsPush = state === 'instant' && !!token;
	const update: Record<string, unknown> = {
		statementsSubscribeId: subId,
		statementId,
		userId: user.uid,
		role: Role.member,
		user: toUser(user),
		statement: toSimpleStatement(statement),
		parentId: statement.parentId,
		topParentId: statement.topParentId || statement.parentId,
		statementType: statement.statementType,
		getInAppNotification: true,
		notificationFrequency: STATE_TO_FREQUENCY[state],
		lastUpdate: Date.now(),
		createdAt: statement.createdAt ?? Date.now(),
	};
	if (wantsPush) {
		update.getPushNotification = true;
		update.tokens = FieldValue.arrayUnion(token);
		update.lastTokenUpdate = Date.now();
	}

	await ref.set(update, { merge: true });
}

/** Current per-question subscription state for the BranchBell. */
export async function getSubscriptionState(
	user: SessionUser,
	statementId: string,
): Promise<SubscriptionState> {
	const subId = getStatementSubscriptionId(statementId, toUser(user));
	if (!subId) return 'unsubscribed';

	const doc = await adminDb.collection(Collections.statementsSubscribe).doc(subId).get();
	if (!doc.exists) return 'unsubscribed';
	const data = doc.data();
	if (!data || data.getInAppNotification !== true) return 'unsubscribed';

	switch (data.notificationFrequency as NotificationFrequency | undefined) {
		case NotificationFrequency.NONE:
			return 'muted';
		case NotificationFrequency.DAILY:
			return 'daily';
		case NotificationFrequency.WEEKLY:
			return 'weekly';
		default:
			return 'instant';
	}
}
