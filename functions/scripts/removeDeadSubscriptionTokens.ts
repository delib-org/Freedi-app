/**
 * One-off: remove dead FCM tokens from one user's `statementsSubscribe.tokens[]`.
 *
 * A token is "dead" when it appears in the user's subscriptions but has no
 * document in `pushNotifications` (doc id = token). The removal is `arrayRemove`
 * only - NO `lastUpdate` stamp, so the user's "recent" ordering and the
 * subscription triggers are left alone.
 *
 * Default is a DRY RUN (counts only). Pass --execute to write.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/removeDeadSubscriptionTokens.ts --user=<uid>
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/removeDeadSubscriptionTokens.ts --user=<uid> --execute
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, DocumentReference } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { SUBSCRIPTION_TOKEN_BATCH_SIZE } from '../src/utils/removeSubscriptionTokens';

/** getAll() is called with this many refs at a time to keep memory bounded. */
const PUSH_LOOKUP_CHUNK = 300;

function readStringArg(name: string): string | undefined {
	const arg = process.argv.find((value) => value.startsWith(`--${name}=`));

	return arg ? arg.slice(name.length + 3) : undefined;
}

async function main(): Promise<void> {
	const project = process.env.GCLOUD_PROJECT;
	const userId = readStringArg('user');
	if (!project || !userId) {
		console.error(
			'Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/removeDeadSubscriptionTokens.ts --user=<uid> [--execute]',
		);
		process.exit(1);
	}
	if (getApps().length === 0) initializeApp({ projectId: project });

	const execute = process.argv.includes('--execute');
	const db = getFirestore();

	// 1. Collect token -> number of subscription docs holding it, plus the doc refs.
	const refsByToken = new Map<string, DocumentReference[]>();
	let subscriptionCount = 0;
	const snapshot = await db
		.collection(Collections.statementsSubscribe)
		.where('userId', '==', userId)
		.select('tokens')
		.get();
	for (const doc of snapshot.docs) {
		subscriptionCount++;
		const tokens: unknown = doc.get('tokens');
		if (!Array.isArray(tokens)) continue;
		for (const token of tokens) {
			if (typeof token !== 'string' || token.length === 0) continue;
			const refs = refsByToken.get(token) ?? [];
			refs.push(doc.ref);
			refsByToken.set(token, refs);
		}
	}

	// 2. A token is alive iff pushNotifications/<token> exists.
	const allTokens = [...refsByToken.keys()];
	const deadTokens: string[] = [];
	for (let i = 0; i < allTokens.length; i += PUSH_LOOKUP_CHUNK) {
		const chunk = allTokens.slice(i, i + PUSH_LOOKUP_CHUNK);
		const snaps = await db.getAll(
			...chunk.map((token) => db.collection(Collections.pushNotifications).doc(token)),
		);
		snaps.forEach((snap, index) => {
			if (!snap.exists) deadTokens.push(chunk[index]);
		});
	}

	const affectedPaths = new Set<string>();
	for (const token of deadTokens) {
		for (const ref of refsByToken.get(token) ?? []) affectedPaths.add(ref.path);
	}

	console.info(
		`# removeDeadSubscriptionTokens - project=${project} user=${userId} ${execute ? '(EXECUTE)' : '(DRY-RUN)'}\n` +
			JSON.stringify(
				{
					subscriptions: subscriptionCount,
					distinctTokens: allTokens.length,
					deadTokens: deadTokens.length,
					subscriptionsToUpdate: affectedPaths.size,
				},
				null,
				2,
			),
	);

	if (!execute || deadTokens.length === 0) return;

	// 3. arrayRemove only, per doc the dead tokens it actually holds, in batches.
	const tokensByPath = new Map<string, { ref: DocumentReference; tokens: string[] }>();
	for (const token of deadTokens) {
		for (const ref of refsByToken.get(token) ?? []) {
			const entry = tokensByPath.get(ref.path) ?? { ref, tokens: [] };
			entry.tokens.push(token);
			tokensByPath.set(ref.path, entry);
		}
	}

	const entries = [...tokensByPath.values()];
	let updated = 0;
	for (let i = 0; i < entries.length; i += SUBSCRIPTION_TOKEN_BATCH_SIZE) {
		const batch = db.batch();
		for (const { ref, tokens } of entries.slice(i, i + SUBSCRIPTION_TOKEN_BATCH_SIZE)) {
			batch.update(ref, { tokens: FieldValue.arrayRemove(...tokens) });
		}
		await batch.commit();
		updated += Math.min(SUBSCRIPTION_TOKEN_BATCH_SIZE, entries.length - i);
		console.info(`committed ${updated}/${entries.length}`);
	}

	console.info(`done: removed ${deadTokens.length} dead tokens from ${updated} subscriptions`);
}

main().catch((error: unknown) => {
	console.error('removeDeadSubscriptionTokens failed:', error);
	process.exit(1);
});
