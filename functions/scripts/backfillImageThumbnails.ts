/**
 * One-time: give every existing statement image a thumbnail. New uploads get
 * one from the onStatementImageUploaded trigger; this covers images uploaded
 * before it shipped.
 *
 * Safe and idempotent: a statement whose thumb already matches its main image
 * is skipped, and a thumb is only recorded while main still points at the
 * image it was made from.
 *
 * USAGE (from functions/):
 *   # preview counts (no writes):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/backfillImageThumbnails.ts
 *   # apply:
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/backfillImageThumbnails.ts --execute
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { Collections } from '@freedi/shared-types';
import { makeThumbnail, type ThumbOutcome } from '../src/images/makeThumbnail';
import { objectNameFromUrl, parseThumbSource } from '../src/images/thumbnailPaths';

if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('FIRESTORE_EMULATOR_HOST is set — this backfill targets a real project. Aborting.');
	process.exit(1);
}
const EXECUTE = process.argv.includes('--execute');
const project = process.env.GCLOUD_PROJECT;
if (!project) {
	console.error(
		'Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/backfillImageThumbnails.ts [--execute]',
	);
	process.exit(1);
}
const storageBucket = process.env.STORAGE_BUCKET ?? `${project}.firebasestorage.app`;
if (getApps().length === 0) initializeApp({ projectId: project, storageBucket });

const db = getFirestore();
const PAGE = 200;

async function main(): Promise<void> {
	console.info(
		`\n# backfill image thumbnails — project=${project} bucket=${storageBucket} ${EXECUTE ? '(EXECUTE)' : '(DRY-RUN)'}\n`,
	);
	const bucketName = getStorage().bucket().name;
	const counts: Record<string, number> = {};
	const bump = (key: string) => (counts[key] = (counts[key] ?? 0) + 1);

	let last: QueryDocumentSnapshot | null = null;
	for (;;) {
		let query = db
			.collection(Collections.statements)
			.where('imagesURL.main', '>', '')
			.orderBy('imagesURL.main')
			.limit(PAGE);
		if (last) query = query.startAfter(last);
		const page = await query.get();
		if (page.empty) break;

		for (const doc of page.docs) {
			const main: string = doc.get('imagesURL.main');
			if (doc.get('imagesURL.thumbOf') === main) {
				bump('already-current');
				continue;
			}
			const objectName = objectNameFromUrl(main, bucketName);
			if (!objectName || !parseThumbSource(objectName)) {
				bump('not-our-image');
				continue;
			}
			if (!EXECUTE) {
				bump('would-process');
				continue;
			}
			try {
				const outcome: ThumbOutcome = await makeThumbnail(objectName, {
					attachRetries: 0,
					retryDelayMs: 0,
				});
				bump(outcome);
			} catch (error) {
				bump('failed');
				console.error(`  ${doc.id}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		last = page.docs[page.docs.length - 1];
		console.info(`  …scanned through ${last.id}`, counts);
	}

	console.info('\nDone:', counts);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
