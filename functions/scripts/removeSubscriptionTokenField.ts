/**
 * Removes the old `tokens` field from `statementsSubscribe` (and from the
 * `awaitingUsers` copies made from it), so no push token stays readable there.
 *
 * Default is a DRY RUN (counts only). Pass --execute to write.
 *
 * Order, so no device loses its pushes:
 *   1. The backfill runs first and creates every missing `pushNotifications` doc.
 *   2. A push-enabled subscription keeps its field if any of its tokens still has
 *      no `pushNotifications` doc (`blockedByMissingOwnerDoc`). Re-run to finish.
 *
 * A token already owned by someone else in `pushNotifications` is removed here
 * without changing that doc: a device belongs to whoever last signed in on it.
 *
 * Writes carry no `lastUpdate`, because clients order subscriptions by it and a
 * cleanup is not user activity. Safe to run again. Output never includes a token.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/removeSubscriptionTokenField.ts
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/removeSubscriptionTokenField.ts --execute
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import {
	FieldValue,
	getFirestore,
	type Firestore,
	type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import {
	backfillPushTokens,
	EXISTING_DOC_LOOKUP_CHUNK,
	type BackfillReport,
} from './backfillPushTokensFromSubscriptions';
import {
	isUsablePushToken,
	SUBSCRIPTION_TOKEN_BATCH_SIZE,
} from '../src/utils/removeSubscriptionTokens';

export interface RemoveTokenFieldReport {
	execute: boolean;
	backfill: BackfillReport | null;
	subscriptionsWithField: number;
	subscriptionsCleared: number;
	blockedByMissingOwnerDoc: number;
	awaitingUsersWithField: number;
	awaitingUsersCleared: number;
}

/** Visits every document of `collectionName` that has the field, one page at a time. */
async function forEachPageWithTokens(
	db: Firestore,
	collectionName: string,
	handlePage: (docs: QueryDocumentSnapshot[]) => Promise<void>,
): Promise<void> {
	let lastDoc: QueryDocumentSnapshot | undefined;

	for (;;) {
		const page = db
			.collection(collectionName)
			.where('tokens', '!=', null)
			.orderBy('tokens')
			.select('tokens', 'getPushNotification')
			.limit(SUBSCRIPTION_TOKEN_BATCH_SIZE);
		const snapshot = await (lastDoc ? page.startAfter(lastDoc) : page).get();
		if (snapshot.docs.length === 0) return;

		await handlePage(snapshot.docs);

		if (snapshot.docs.length < SUBSCRIPTION_TOKEN_BATCH_SIZE) return;
		lastDoc = snapshot.docs[snapshot.docs.length - 1];
	}
}

/** The tokens a document still delivers to through the fallback. */
function deliveringTokens(doc: QueryDocumentSnapshot): string[] {
	const { tokens, getPushNotification } = doc.data() as {
		tokens?: unknown;
		getPushNotification?: boolean;
	};
	if (getPushNotification !== true || !Array.isArray(tokens)) return [];

	return tokens.filter(isUsablePushToken);
}

/** Of the page's delivering tokens, the ones with no `pushNotifications` document. */
async function findUnownedTokens(
	db: Firestore,
	docs: QueryDocumentSnapshot[],
): Promise<Set<string>> {
	const tokens = [...new Set(docs.flatMap(deliveringTokens))];
	const unowned = new Set<string>();

	for (let i = 0; i < tokens.length; i += EXISTING_DOC_LOOKUP_CHUNK) {
		const chunk = tokens.slice(i, i + EXISTING_DOC_LOOKUP_CHUNK);
		const snaps = await db.getAll(
			...chunk.map((token) => db.collection(Collections.pushNotifications).doc(token)),
		);
		snaps.forEach((snap, index) => {
			if (!snap.exists) unowned.add(chunk[index]);
		});
	}

	return unowned;
}

async function deleteTokensField(db: Firestore, docs: QueryDocumentSnapshot[]): Promise<void> {
	const batch = db.batch();
	docs.forEach((doc) => batch.update(doc.ref, { tokens: FieldValue.delete() }));
	await batch.commit();
}

async function clearSubscriptions(db: Firestore, report: RemoveTokenFieldReport): Promise<void> {
	await forEachPageWithTokens(db, Collections.statementsSubscribe, async (docs) => {
		report.subscriptionsWithField += docs.length;
		const unowned = await findUnownedTokens(db, docs);
		const clearable = docs.filter(
			(doc) => !deliveringTokens(doc).some((token) => unowned.has(token)),
		);
		report.blockedByMissingOwnerDoc += docs.length - clearable.length;
		if (!report.execute || clearable.length === 0) return;

		await deleteTokensField(db, clearable);
		report.subscriptionsCleared += clearable.length;
	});
}

async function clearAwaitingUsers(db: Firestore, report: RemoveTokenFieldReport): Promise<void> {
	await forEachPageWithTokens(db, Collections.awaitingUsers, async (docs) => {
		report.awaitingUsersWithField += docs.length;
		if (!report.execute) return;

		await deleteTokensField(db, docs);
		report.awaitingUsersCleared += docs.length;
	});
}

/** Runs the cleanup. Writes only when `execute` is true. */
export async function removeSubscriptionTokenField(
	db: Firestore,
	execute: boolean,
	now: number = Date.now(),
): Promise<RemoveTokenFieldReport> {
	const report: RemoveTokenFieldReport = {
		execute,
		backfill: null,
		subscriptionsWithField: 0,
		subscriptionsCleared: 0,
		blockedByMissingOwnerDoc: 0,
		awaitingUsersWithField: 0,
		awaitingUsersCleared: 0,
	};

	report.backfill = await backfillPushTokens(db, execute, now);
	await clearSubscriptions(db, report);
	await clearAwaitingUsers(db, report);

	return report;
}

async function main(): Promise<void> {
	const project = process.env.GCLOUD_PROJECT;
	if (!project) {
		console.error(
			'Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/removeSubscriptionTokenField.ts [--execute]',
		);
		process.exit(1);
	}
	if (getApps().length === 0) initializeApp({ projectId: project });

	const execute = process.argv.includes('--execute');
	const report = await removeSubscriptionTokenField(getFirestore(), execute);

	console.info(
		`# removeSubscriptionTokenField - project=${project} ${execute ? '(EXECUTE)' : '(DRY-RUN)'}\n` +
			JSON.stringify(report, null, 2),
	);
}

if (require.main === module) {
	main().catch((error: unknown) => {
		console.error('removeSubscriptionTokenField failed:', (error as Error)?.message);
		process.exit(1);
	});
}
