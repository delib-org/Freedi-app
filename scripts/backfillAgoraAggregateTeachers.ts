/**
 * Backfill: copy each class's `teacherMap` onto its `agoraClassAggregates`
 * document.
 *
 * The teacher's dashboard reads class advancement with one
 * `where('teacherMap.<uid>', '==', true)` query instead of asking a function,
 * and the security rule proves that from the map on the aggregate itself.
 * Aggregates written before the field existed have no map — their rule falls
 * back to a `get()` of the class, which still answers a single-document read
 * but cannot serve the query. Worse, Firestore indexes on write: an aggregate
 * that has never been rewritten is not IN the index the query walks, so those
 * classes would simply be missing their advancement on the dashboard until
 * their next finished game.
 *
 * This walks every aggregate, reads its class, and writes the map. Idempotent:
 * an aggregate that already matches its class is left alone.
 *
 * USAGE
 *   - Local emulator:
 *       FIRESTORE_EMULATOR_HOST=localhost:8101 GCLOUD_PROJECT=freedi-test \
 *         npx tsx scripts/backfillAgoraAggregateTeachers.ts
 *
 *   - Production (read-write):
 *       gcloud auth application-default login
 *       GCLOUD_PROJECT=wizcol-app \
 *         npx tsx scripts/backfillAgoraAggregateTeachers.ts --confirm-prod
 *
 *   Optional flags:
 *     --dry-run    Report what would change without writing
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, AgoraClass, AgoraClassAggregate } from '@freedi/shared-types';

const dryRun = process.argv.includes('--dry-run');
const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (!emulator && !process.argv.includes('--confirm-prod')) {
	console.error(
		'Refusing to touch a real project without --confirm-prod (or point FIRESTORE_EMULATOR_HOST at an emulator).',
	);
	process.exit(1);
}

if (getApps().length === 0) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();

/** Same map, same keys, same values — nothing to write. */
function sameMap(a: Record<string, boolean> = {}, b: Record<string, boolean> = {}): boolean {
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

	return [...keys].every((key) => a[key] === b[key]);
}

async function main(): Promise<void> {
	const aggregates = await db.collection(Collections.agoraClassAggregates).get();
	console.info(`Found ${aggregates.size} class aggregates.`);

	let written = 0;
	let skipped = 0;
	let orphaned = 0;
	let batch = db.batch();
	let pending = 0;

	for (const snap of aggregates.docs) {
		const aggregate = snap.data() as AgoraClassAggregate;
		const classSnap = await db
			.collection(Collections.agoraClasses)
			.doc(aggregate.classId ?? snap.id)
			.get();
		const agoraClass = classSnap.data() as AgoraClass | undefined;
		if (!agoraClass) {
			// An aggregate whose class is gone. Left as it is: deleting history
			// is not this script's job, and no teacher can reach it either way.
			orphaned += 1;
			continue;
		}
		if (sameMap(aggregate.teacherMap, agoraClass.teacherMap)) {
			skipped += 1;
			continue;
		}
		if (!dryRun) {
			batch.update(snap.ref, { teacherMap: agoraClass.teacherMap, lastUpdate: Date.now() });
			pending += 1;
			if (pending === 400) {
				await batch.commit();
				batch = db.batch();
				pending = 0;
			}
		}
		written += 1;
	}

	if (!dryRun && pending > 0) await batch.commit();

	console.info(
		`${dryRun ? 'Would write' : 'Wrote'} ${written}; already current ${skipped}; class gone ${orphaned}.`,
	);
}

main().catch((error: unknown) => {
	console.error('Backfill failed:', error);
	process.exit(1);
});
