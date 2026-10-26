/**
 * Backfill: give every merged-away (hidden) cluster's direct votes back to the
 * cluster that absorbed it, by filling the winner's `absorbedClusterIds`.
 * Logic and report live in src/migrations/backfillAbsorbedClusterVotes.ts.
 *
 * Dry run by default: prints, per question, how many orphaned direct votes
 * would be restored and how each winner's voters/consensus would change.
 *
 * USAGE (from functions/):
 *   # dry run (no writes):
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillAbsorbedClusterVotes.ts
 *   # write + recompute each winner:
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillAbsorbedClusterVotes.ts --execute
 *   # also apply links guessed from membership (listed as "inferred" in the dry run):
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillAbsorbedClusterVotes.ts --execute --include-inferred
 *   # production additionally needs --confirm-prod:
 *   GCLOUD_PROJECT=synthesistalyaron npx tsx scripts/backfillAbsorbedClusterVotes.ts --execute --confirm-prod
 *   # against the solo emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8101 GCLOUD_PROJECT=freedi-test npx tsx scripts/backfillAbsorbedClusterVotes.ts --execute
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
	backfillAbsorbedClusterVotes,
	formatBackfillReport,
} from '../src/migrations/backfillAbsorbedClusterVotes';
import { checkBackfillRun } from '../src/migrations/backfillRunGuard';

async function main(): Promise<void> {
	const guard = checkBackfillRun({
		project: process.env.GCLOUD_PROJECT,
		emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
		argv: process.argv,
	});
	if (!guard.ok) {
		console.error(guard.reason);
		process.exit(1);
	}
	if (getApps().length === 0) initializeApp({ projectId: guard.project });

	const report = await backfillAbsorbedClusterVotes(getFirestore(), {
		execute: guard.execute,
		includeInferred: process.argv.includes('--include-inferred'),
	});
	console.info(
		`# backfill absorbed cluster votes — project=${guard.project} ` +
			`${guard.execute ? '(EXECUTE)' : '(DRY-RUN)'}` +
			formatBackfillReport(report),
	);
}

main().catch((error: unknown) => {
	console.error('backfillAbsorbedClusterVotes failed:', error);
	process.exit(1);
});
