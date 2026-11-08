/**
 * Backfill of the per-question evaluator count (evaluationParticipants).
 *
 * Phase `participants`: creates the missing `evaluationParticipants` markers
 *   from the existing evaluations (cursor over `evaluations`).
 * Phase `counts`: sets each question's evaluator count to its number of
 *   markers (cursor over `evaluationParticipants`), writing only questions
 *   whose stored count differs.
 *
 * Bounded and resumable: every page prints the cursor to continue from, so an
 * interrupted run restarts with `--cursor=<id>`. Idempotent: re-running creates
 * nothing twice and rewrites no question that is already right.
 *
 * ORDER (see docs/architecture/firebase-cost-2026-10/lane-b-results.md):
 *   1. deploy firestore.rules
 *   2. run `participants`, then `counts`      (old functions still running)
 *   3. deploy the new functions
 *   4. run `participants`, then `counts` again (catches the gap)
 *
 * USAGE (from functions/):
 *   # dry run (no writes):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/backfillEvaluationParticipants.ts --phase=participants
 *   # apply, resuming from a cursor:
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/backfillEvaluationParticipants.ts --phase=counts --execute --cursor=<docId>
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
	backfillParticipantsPage,
	syncParentCountsPage,
} from '../src/migrations/backfillEvaluationParticipants';

if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.info('FIRESTORE_EMULATOR_HOST is set - running against the emulator.');
}

const EXECUTE = process.argv.includes('--execute');
const phaseArg = process.argv.find((arg) => arg.startsWith('--phase='))?.split('=')[1];
const cursorArg = process.argv.find((arg) => arg.startsWith('--cursor='))?.split('=')[1];
const project = process.env.GCLOUD_PROJECT;

if (!project || (phaseArg !== 'participants' && phaseArg !== 'counts')) {
	console.error(
		'Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/backfillEvaluationParticipants.ts --phase=participants|counts [--execute] [--cursor=<docId>]',
	);
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: project });

const db = getFirestore();

async function main(): Promise<void> {
	console.info(
		`# backfill evaluationParticipants - phase=${phaseArg} ${EXECUTE ? '(EXECUTE)' : '(DRY-RUN)'}`,
	);

	let cursor: string | null = cursorArg ?? null;
	let scanned = 0;
	let changed = 0;

	do {
		if (phaseArg === 'participants') {
			const result = await backfillParticipantsPage(db, cursor, EXECUTE);
			scanned += result.scanned;
			changed += result.created;
			cursor = result.nextCursor;
		} else {
			const result = await syncParentCountsPage(db, cursor, EXECUTE);
			scanned += result.scanned;
			changed += result.parentsUpdated;
			cursor = result.nextCursor;
		}
		console.info(`  scanned=${scanned} changed=${changed} nextCursor=${cursor ?? 'DONE'}`);
	} while (cursor);

	console.info(
		`Done. scanned=${scanned} ${phaseArg === 'participants' ? 'markers' : 'questions'} ${EXECUTE ? 'written' : 'to write'}=${changed}`,
	);
	if (!EXECUTE) console.info('(DRY-RUN - nothing written. Re-run with --execute to apply.)');
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error('backfill failed:', error);
		process.exit(1);
	});
