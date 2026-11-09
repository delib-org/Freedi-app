/**
 * Copies push tokens from `statementsSubscribe.tokens[]` to the owner-only
 * `pushNotifications/{token}` collection, so the tokens can later be removed
 * from subscription documents, which any signed-in user can read.
 *
 * Default is a DRY RUN (counts only). Pass --execute to write. It only creates
 * documents: an existing `pushNotifications` document is never changed, because
 * it was written by the device's real owner more recently than any copy here.
 * Nothing is deleted, and running it again creates only what is still missing.
 *
 * Only subscriptions with `getPushNotification == true` are read. Those are the
 * tokens that receive pushes today; a token kept only on a switched-off
 * subscription must not start receiving them.
 *
 * A token listed under two different users goes to the owner of the most
 * recently updated subscription: that is the last person seen using the device.
 * A tie goes to the smaller userId, so every run picks the same owner.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillPushTokensFromSubscriptions.ts
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillPushTokensFromSubscriptions.ts --execute
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import {
	FieldPath,
	getFirestore,
	type DocumentReference,
	type Firestore,
	type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { SUBSCRIPTION_TOKEN_BATCH_SIZE } from '../src/utils/removeSubscriptionTokens';

/** Subscriptions read per page. */
export const SUBSCRIPTION_PAGE_SIZE = 1000;

/** getAll() is called with this many refs at a time to keep memory bounded. */
export const EXISTING_DOC_LOOKUP_CHUNK = 300;

/** Firestore's limit on a document id, in bytes. */
const MAX_DOC_ID_BYTES = 1500;

/** gRPC status for a create() on a document that already exists. */
const GRPC_ALREADY_EXISTS = 6;

/** Marks a document as written by this script, to find or review them later. */
export const BACKFILL_SOURCE = 'statementsSubscribe-backfill';

export interface BackfillReport {
	execute: boolean;
	subscriptionsScanned: number;
	subscriptionsWithoutUser: number;
	malformedTokens: number;
	distinctTokens: number;
	duplicateOwnerTokens: number;
	alreadyInPushNotifications: number;
	alreadyOwnedByAnotherUser: number;
	toCreate: number;
	created: number;
	lostRaceToExistingDoc: number;
	failed: number;
}

interface TokenOwner {
	userId: string;
	updatedAt: number;
}

interface TokenCandidate extends TokenOwner {
	userIds: Set<string>;
}

/** Subscription times are ms today, but older documents can hold a Firestore Timestamp. */
function toMillis(value: unknown): number {
	if (typeof value === 'number') return value;
	const timestamp = value as { toMillis?: () => number } | null | undefined;

	return typeof timestamp?.toMillis === 'function' ? timestamp.toMillis() : 0;
}

/** True when `token` can be used as a document id. */
function isUsableToken(token: unknown): token is string {
	return (
		typeof token === 'string' &&
		token.length > 0 &&
		!token.includes('/') &&
		Buffer.byteLength(token) <= MAX_DOC_ID_BYTES
	);
}

/** True when `candidate` should replace `current` as the token's owner. */
function isBetterOwner(candidate: TokenOwner, current: TokenOwner): boolean {
	if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;

	return candidate.userId < current.userId;
}

/** Records one subscription's tokens in `candidates`. */
function collectTokens(
	doc: QueryDocumentSnapshot,
	candidates: Map<string, TokenCandidate>,
	report: BackfillReport,
): void {
	const userId = (doc.get('userId') || doc.get('user.uid')) as string | undefined;
	const tokens: unknown = doc.get('tokens');
	if (!Array.isArray(tokens) || tokens.length === 0) return;
	if (!userId) {
		report.subscriptionsWithoutUser++;

		return;
	}

	// tokens[] syncs write lastTokenUpdate and leave lastUpdate alone, so both count.
	const updatedAt = Math.max(toMillis(doc.get('lastUpdate')), toMillis(doc.get('lastTokenUpdate')));

	for (const token of tokens) {
		if (!isUsableToken(token)) {
			report.malformedTokens++;
			continue;
		}
		const owner = { userId, updatedAt };
		const current = candidates.get(token);
		if (!current) {
			candidates.set(token, { ...owner, userIds: new Set([userId]) });
			continue;
		}
		current.userIds.add(userId);
		if (isBetterOwner(owner, current)) Object.assign(current, owner);
	}
}

/** Reads every push-enabled subscription, one page at a time. */
async function scanSubscriptions(
	db: Firestore,
	report: BackfillReport,
): Promise<Map<string, TokenCandidate>> {
	const candidates = new Map<string, TokenCandidate>();
	let lastDoc: QueryDocumentSnapshot | undefined;

	for (;;) {
		const page = db
			.collection(Collections.statementsSubscribe)
			.where('getPushNotification', '==', true)
			.orderBy(FieldPath.documentId())
			.select('tokens', 'userId', 'user.uid', 'lastUpdate', 'lastTokenUpdate')
			.limit(SUBSCRIPTION_PAGE_SIZE);
		const snapshot = await (lastDoc ? page.startAfter(lastDoc) : page).get();

		for (const doc of snapshot.docs) {
			report.subscriptionsScanned++;
			collectTokens(doc, candidates, report);
		}

		if (snapshot.docs.length < SUBSCRIPTION_PAGE_SIZE) return candidates;
		lastDoc = snapshot.docs[snapshot.docs.length - 1];
	}
}

/** Leaves only the tokens with no `pushNotifications` document yet. */
async function findMissing(
	db: Firestore,
	candidates: Map<string, TokenCandidate>,
	report: BackfillReport,
): Promise<Array<[string, TokenCandidate]>> {
	const entries = [...candidates];
	const missing: Array<[string, TokenCandidate]> = [];

	for (let i = 0; i < entries.length; i += EXISTING_DOC_LOOKUP_CHUNK) {
		const chunk = entries.slice(i, i + EXISTING_DOC_LOOKUP_CHUNK);
		const snaps = await db.getAll(
			...chunk.map(([token]) => db.collection(Collections.pushNotifications).doc(token)),
		);
		snaps.forEach((snap, index) => {
			const [, candidate] = chunk[index];
			if (!snap.exists) {
				missing.push(chunk[index]);

				return;
			}
			report.alreadyInPushNotifications++;
			if (snap.get('userId') !== candidate.userId) report.alreadyOwnedByAnotherUser++;
		});
	}

	return missing;
}

/** Creates one document after its batch failed, sorting out which documents were the cause. */
async function createOne(
	ref: DocumentReference,
	data: Record<string, unknown>,
	report: BackfillReport,
): Promise<void> {
	try {
		await ref.create(data);
		report.created++;
	} catch (error) {
		const code = (error as { code?: number | string })?.code;
		if (code === GRPC_ALREADY_EXISTS) {
			report.lostRaceToExistingDoc++;

			return;
		}
		report.failed++;
		// The code only: Firestore error text can quote the path, which contains the token.
		console.error(`create failed with code ${code} for user ${String(data.userId)}`);
	}
}

/**
 * Creates the missing documents. `create` fails on an existing document, so even
 * a device that registers while this runs keeps the document it just wrote.
 *
 * `lastUpdate` is a number (ms, like every other new timestamp) on purpose. The
 * stale sweep in fn_tokenCleanup compares against a Date, so it skips numbers. It
 * must skip these: the sweep also strips the token from the user's subscriptions,
 * which would stop pushes to a device that only stopped opening the app.
 * When the app next runs on the device, storeToken gives the doc the normal lifecycle.
 */
async function createMissing(
	db: Firestore,
	missing: Array<[string, TokenCandidate]>,
	report: BackfillReport,
	now: number,
): Promise<void> {
	for (let i = 0; i < missing.length; i += SUBSCRIPTION_TOKEN_BATCH_SIZE) {
		const writes = missing.slice(i, i + SUBSCRIPTION_TOKEN_BATCH_SIZE).map(([token, owner]) => ({
			ref: db.collection(Collections.pushNotifications).doc(token),
			data: { token, userId: owner.userId, lastUpdate: now, source: BACKFILL_SOURCE },
		}));

		try {
			const batch = db.batch();
			writes.forEach(({ ref, data }) => batch.create(ref, data));
			await batch.commit();
			report.created += writes.length;
		} catch {
			for (const { ref, data } of writes) await createOne(ref, data, report);
		}
		console.info(`processed ${Math.min(i + writes.length, missing.length)}/${missing.length}`);
	}
}

/** Runs the backfill. Writes only when `execute` is true. */
export async function backfillPushTokens(
	db: Firestore,
	execute: boolean,
	now: number = Date.now(),
): Promise<BackfillReport> {
	const report: BackfillReport = {
		execute,
		subscriptionsScanned: 0,
		subscriptionsWithoutUser: 0,
		malformedTokens: 0,
		distinctTokens: 0,
		duplicateOwnerTokens: 0,
		alreadyInPushNotifications: 0,
		alreadyOwnedByAnotherUser: 0,
		toCreate: 0,
		created: 0,
		lostRaceToExistingDoc: 0,
		failed: 0,
	};

	const candidates = await scanSubscriptions(db, report);
	report.distinctTokens = candidates.size;
	report.duplicateOwnerTokens = [...candidates.values()].filter(
		(candidate) => candidate.userIds.size > 1,
	).length;

	const missing = await findMissing(db, candidates, report);
	report.toCreate = missing.length;

	if (execute) await createMissing(db, missing, report, now);

	return report;
}

async function main(): Promise<void> {
	const project = process.env.GCLOUD_PROJECT;
	if (!project) {
		console.error(
			'Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/backfillPushTokensFromSubscriptions.ts [--execute]',
		);
		process.exit(1);
	}
	if (getApps().length === 0) initializeApp({ projectId: project });

	const execute = process.argv.includes('--execute');
	const report = await backfillPushTokens(getFirestore(), execute);

	console.info(
		`# backfillPushTokensFromSubscriptions - project=${project} ${execute ? '(EXECUTE)' : '(DRY-RUN)'}\n` +
			JSON.stringify(report, null, 2),
	);
}

if (require.main === module) {
	main().catch((error: unknown) => {
		console.error('backfillPushTokensFromSubscriptions failed:', (error as Error)?.message);
		process.exit(1);
	});
}
