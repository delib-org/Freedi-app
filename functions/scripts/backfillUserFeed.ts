/**
 * Backfill `userFeed` from existing top-level subscriptions (rollout phase 1).
 *
 * Run AFTER the functions that maintain userFeed are deployed (so new joins are
 * covered) and BEFORE the hosting build that reads userFeed.
 *
 * Bounded + resumable: each run processes at most --max-pages pages and saves
 * its cursor in `_migrations/backfillUserFeed`; run again to continue. Safe to
 * re-run at any time (only creates missing entries / raises lastActivity).
 *
 * USAGE (from functions/):
 *   # dry run of the first 5 pages (no writes, no progress saved):
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillUserFeed.ts --max-pages=5
 *   # apply, 50 pages per run, until it prints done=true:
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillUserFeed.ts --execute --max-pages=50
 *   # start over from the beginning:
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillUserFeed.ts --execute --restart
 *   # against the solo emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8101 GCLOUD_PROJECT=<proj> npx tsx scripts/backfillUserFeed.ts --execute
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { backfillUserFeed } from '../src/migrations/backfillUserFeed';

function readNumberArg(name: string): number | undefined {
	const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
	if (!arg) return undefined;
	const parsed = Number(arg.split('=')[1]);

	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function main(): Promise<void> {
	const project = process.env.GCLOUD_PROJECT;
	if (!project) {
		console.error('Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/backfillUserFeed.ts [--execute]');
		process.exit(1);
	}
	if (getApps().length === 0) initializeApp({ projectId: project });

	const execute = process.argv.includes('--execute');
	const progress = await backfillUserFeed(getFirestore(), {
		dryRun: !execute,
		restart: process.argv.includes('--restart'),
		maxPages: readNumberArg('max-pages'),
		pageSize: readNumberArg('page-size'),
	});

	console.info(
		`# backfill userFeed — project=${project} ${execute ? '(EXECUTE)' : '(DRY-RUN)'}\n` +
			JSON.stringify(progress, null, 2),
	);
}

main().catch((error: unknown) => {
	console.error('backfillUserFeed failed:', error);
	process.exit(1);
});
