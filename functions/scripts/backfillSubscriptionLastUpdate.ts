/**
 * One-time migration: set `lastUpdate` on every `statementsSubscribe` doc that
 * is MISSING the field, so legacy/partial subscription docs stop vanishing from
 * the home-screen listeners.
 *
 * Why this is REQUIRED:
 * `listenToStatementSubscriptions` and `getNewStatementsFromSubscriptions`
 * (src/controllers/db/subscriptions/getSubscriptions.ts) both end their query
 * with `orderBy('lastUpdate', 'desc')`. A Firestore orderBy silently EXCLUDES
 * every document that lacks the ordered field. Subscriptions created before the
 * field was promoted — or upserted by paths like setRoleToDB with only `{ role }`
 * — have no `lastUpdate`, so they never reach the home screen on a cold load
 * (they only show up after another listener loads them into Redux).
 *
 * Safe: it only ADDS `lastUpdate` where the field is absent, deriving the value
 * from the doc's own `createdAt` when present (preserving real recency) and
 * falling back to now. It never overwrites an existing `lastUpdate`.
 * Idempotent: re-running processes only docs still missing the field.
 *
 * Firestore can't query "field is missing", so this scans the whole collection
 * paginated by document id and updates the gaps.
 *
 * USAGE (from functions/):
 *   # preview counts (no writes):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/backfillSubscriptionLastUpdate.ts
 *   # apply:
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/backfillSubscriptionLastUpdate.ts --execute
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.error(
		'FIRESTORE_EMULATOR_HOST is set — this migration targets a real project. Aborting.',
	);
	process.exit(1);
}
const EXECUTE = process.argv.includes('--execute');
const project = process.env.GCLOUD_PROJECT;
if (!project) {
	console.error(
		'Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/backfillSubscriptionLastUpdate.ts [--execute]',
	);
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: project });

const db = getFirestore();
const PAGE = 500;

function deriveLastUpdate(data: FirebaseFirestore.DocumentData): number {
	const createdAt = data.createdAt;
	if (typeof createdAt === 'number' && createdAt > 0) return createdAt;
	// Firestore Timestamp fallback (legacy docs that stored a Timestamp)
	if (createdAt && typeof createdAt.toMillis === 'function') return createdAt.toMillis();

	return Date.now();
}

async function main(): Promise<void> {
	console.info(
		`\n# backfill statementsSubscribe.lastUpdate — project=${project} ${
			EXECUTE ? '(EXECUTE)' : '(DRY-RUN)'
		}\n`,
	);

	let last: QueryDocumentSnapshot | null = null;
	let scanned = 0;
	let missing = 0;
	let written = 0;
	let pendingBatch = db.batch();
	let pendingCount = 0;

	const flush = async (): Promise<void> => {
		if (pendingCount === 0) return;
		if (EXECUTE) await pendingBatch.commit();
		written += pendingCount;
		pendingBatch = db.batch();
		pendingCount = 0;
	};

	for (;;) {
		let q = db.collection('statementsSubscribe').orderBy('__name__').limit(PAGE);
		if (last) q = q.startAfter(last);
		const snap = await q.get();
		if (snap.empty) break;

		for (const doc of snap.docs) {
			scanned++;
			const data = doc.data();
			if (data.lastUpdate === undefined || data.lastUpdate === null) {
				missing++;
				pendingBatch.update(doc.ref, { lastUpdate: deriveLastUpdate(data) });
				pendingCount++;
				if (pendingCount >= 400) await flush();
			}
		}
		last = snap.docs[snap.docs.length - 1];
		if (scanned % 5000 === 0) console.info(`  scanned ${scanned}… (missing so far ${missing})`);
	}
	await flush();

	console.info(
		`\nDone. scanned=${scanned} | missing lastUpdate=${missing} | ${
			EXECUTE ? `written=${written}` : 'would write=' + missing
		}`,
	);
	if (!EXECUTE) console.info('(DRY-RUN — nothing written. Re-run with --execute to apply.)');
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('backfill failed:', e);
		process.exit(1);
	});
