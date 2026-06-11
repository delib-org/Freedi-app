/**
 * One-time migration: set `hide: false` on every `statements` doc that is
 * MISSING the field, so the field is reliable and the options listener can
 * filter `where('hide','==',false)` server-side without dropping legacy docs.
 *
 * Why this is REQUIRED before deploying the `hide == false` query change:
 * a Firestore equality filter `hide == false` matches only docs that have the
 * field explicitly set to false. ~15% of existing option docs have no `hide`
 * field at all (they were visible by absence). Without this backfill they would
 * vanish from the list once the filter ships.
 *
 * Safe: it only ADDS `hide: false` where the field is absent — it never changes
 * an existing `hide: true`/`false`, so it cannot alter current visibility.
 * Idempotent: re-running processes only docs still missing the field.
 *
 * Firestore can't query "field is missing", so this scans the whole collection
 * paginated by document id and updates the gaps.
 *
 * USAGE (from functions/):
 *   # preview counts (no writes):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/backfillHideField.ts
 *   # apply:
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/backfillHideField.ts --execute
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
	console.error('Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/backfillHideField.ts [--execute]');
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: project });

const db = getFirestore();
const PAGE = 500;

async function main(): Promise<void> {
	console.info(
		`\n# backfill hide:false — project=${project} ${EXECUTE ? '(EXECUTE)' : '(DRY-RUN)'}\n`,
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
		let q = db.collection('statements').orderBy('__name__').limit(PAGE);
		if (last) q = q.startAfter(last);
		const snap = await q.get();
		if (snap.empty) break;

		for (const doc of snap.docs) {
			scanned++;
			const hide = doc.data().hide;
			if (hide === undefined || hide === null) {
				missing++;
				pendingBatch.update(doc.ref, { hide: false });
				pendingCount++;
				if (pendingCount >= 400) await flush();
			}
		}
		last = snap.docs[snap.docs.length - 1];
		if (scanned % 5000 === 0) console.info(`  scanned ${scanned}… (missing so far ${missing})`);
	}
	await flush();

	console.info(
		`\nDone. scanned=${scanned} | missing hide=${missing} | ${EXECUTE ? `written=${written}` : 'would write=' + missing}`,
	);
	if (!EXECUTE) console.info('(DRY-RUN — nothing written. Re-run with --execute to apply.)');
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('backfill failed:', e);
		process.exit(1);
	});
