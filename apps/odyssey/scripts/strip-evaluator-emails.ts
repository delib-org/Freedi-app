/**
 * strip-evaluator-emails — removes the personal details that were written onto
 * every Odyssey rating, from the ratings already collected.
 *
 * `evaluations` are readable by any signed-in user (firestore.rules says so
 * deliberately: Odyssey's opinion map and fellow-sailor list load the whole
 * game's evaluations in the browser). Ratings written before the fix embedded
 * the player's full Google account — email, full name, photo URL — beside their
 * answer on every political question they touched, so any player could harvest
 * the lot through the app's own loader. `voyageIdentity()` in
 * src/lib/evaluations.ts stops new ratings carrying it; this cleans up the old
 * ones, rewriting each `evaluator` to the first name the UI has always shown.
 *
 * Ratings are NOT deleted and no answer changes — only the identity attached
 * to them shrinks.
 *
 *   # look first, always
 *   ODYSSEY_FIRESTORE_HOST=localhost:8181 \
 *     npx tsx apps/odyssey/scripts/strip-evaluator-emails.ts --game default --dry-run
 *
 *   # production: no emulator host, real credentials
 *   ODYSSEY_PROJECT_ID=wizcol-app GOOGLE_APPLICATION_CREDENTIALS=... \
 *     npx tsx apps/odyssey/scripts/strip-evaluator-emails.ts --game default
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.ODYSSEY_PROJECT_ID ?? 'freedi-test';
const FIRESTORE_HOST = process.env.ODYSSEY_FIRESTORE_HOST;
/** Firestore's own ceiling on a batch */
const BATCH_SIZE = 500;

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);

	return index === -1 ? undefined : process.argv[index + 1];
}

const gameId = arg('game') ?? 'default';
const dryRun = process.argv.includes('--dry-run');

if (FIRESTORE_HOST) process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
const db: Firestore = getFirestore(app);

interface StoredEvaluator {
	uid?: string;
	displayName?: string | null;
	email?: string | null;
	photoURL?: string | null;
	isAnonymous?: boolean;
}

/** Mirrors voyageIdentity() in src/lib/evaluations.ts — keep the two together. */
function minimalEvaluator(evaluator: StoredEvaluator, evaluatorId: string): StoredEvaluator {
	const identity: StoredEvaluator = {
		uid: evaluator.uid ?? evaluatorId,
		displayName: (evaluator.displayName ?? '').trim().split(/\s+/)[0] || 'מפליג/ה',
	};
	if (evaluator.isAnonymous !== undefined) identity.isAnonymous = evaluator.isAnonymous;

	return identity;
}

/** Already clean: no email, no photo, and the name is a single word. */
function isClean(evaluator: StoredEvaluator): boolean {
	return (
		evaluator.email === undefined &&
		evaluator.photoURL === undefined &&
		!/\s/.test((evaluator.displayName ?? '').trim())
	);
}

async function main(): Promise<void> {
	console.info(
		`project ${PROJECT_ID}${FIRESTORE_HOST ? ` (emulator ${FIRESTORE_HOST})` : ' (LIVE)'} · game ${gameId}${dryRun ? ' · DRY RUN' : ''}`,
	);

	const snap = await db.collection('evaluations').where('odysseyGameId', '==', gameId).get();
	console.info(`${snap.size} ratings in this game`);

	const dirty = snap.docs.filter((docSnap) => {
		const evaluator = (docSnap.data().evaluator ?? {}) as StoredEvaluator;

		return !isClean(evaluator);
	});

	const exposedEmails = new Set(
		dirty
			.map((docSnap) => (docSnap.data().evaluator as StoredEvaluator)?.email)
			.filter((email): email is string => !!email),
	);
	console.info(
		`${dirty.length} carry personal details · ${exposedEmails.size} distinct email addresses were exposed`,
	);

	if (dirty.length === 0) {
		console.info('nothing to do');

		return;
	}
	if (dryRun) {
		const sample = dirty[0].data() as { evaluatorId: string; evaluator: StoredEvaluator };
		console.info('example rewrite:');
		console.info('  before', JSON.stringify(sample.evaluator));
		console.info('  after ', JSON.stringify(minimalEvaluator(sample.evaluator, sample.evaluatorId)));
		console.info('re-run without --dry-run to apply');

		return;
	}

	for (let start = 0; start < dirty.length; start += BATCH_SIZE) {
		const batch = db.batch();
		for (const docSnap of dirty.slice(start, start + BATCH_SIZE)) {
			const data = docSnap.data() as { evaluatorId: string; evaluator: StoredEvaluator };
			batch.update(docSnap.ref, {
				evaluator: minimalEvaluator(data.evaluator ?? {}, data.evaluatorId),
			});
		}
		await batch.commit();
		console.info(`  ${Math.min(start + BATCH_SIZE, dirty.length)}/${dirty.length}`);
	}
	console.info('done — no rating was deleted and no answer changed');
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
