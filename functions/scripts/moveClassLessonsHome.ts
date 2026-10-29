/**
 * Phase-2 migration (IA docs/ia/join-class-lesson-plan.md section 13): move every old
 * top-level join-class lesson under its teacher home `jcTeacher_{uid}`, and give it a
 * lesson plan + game. Logic and report live in src/migrations/moveClassLessonsHome.ts.
 *
 * Dry run by default: prints, per lesson, the descendants and subscriptions it would
 * rewrite, the home it would create, and why a lesson is skipped (live right now).
 *
 * RUN ORDER (never out of order): shared-types repack -> functions -> rules -> indexes
 * (built) -> join-class client with `parents` queries LIVE -> this script.
 *
 * USAGE (from functions/):
 *   # dry run (no writes):
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/moveClassLessonsHome.ts
 *   # one lesson first:
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/moveClassLessonsHome.ts --only=<lessonId> --execute
 *   # all lessons:
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/moveClassLessonsHome.ts --execute
 *   # the sweep, after the first run (catches children written during the move):
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/moveClassLessonsHome.ts --execute --sweep
 *   # production additionally needs --confirm-prod:
 *   GCLOUD_PROJECT=synthesistalyaron npx tsx scripts/moveClassLessonsHome.ts --execute --confirm-prod
 *   # against an emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:<port> GCLOUD_PROJECT=freedi-test npx tsx scripts/moveClassLessonsHome.ts
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { formatMoveReport, moveClassLessonsHome } from '../src/migrations/moveClassLessonsHome';
import { checkBackfillRun } from '../src/migrations/backfillRunGuard';

function onlyArg(argv: readonly string[]): string | undefined {
	const arg = argv.find((a) => a.startsWith('--only='));

	return arg ? arg.slice('--only='.length) || undefined : undefined;
}

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

	const report = await moveClassLessonsHome(getFirestore(), {
		execute: guard.execute,
		sweep: process.argv.includes('--sweep'),
		onlyLessonId: onlyArg(process.argv),
	});
	console.info(
		`# move class lessons home — project=${guard.project} ` +
			`${guard.execute ? '(EXECUTE)' : '(DRY-RUN)'}` +
			formatMoveReport(report),
	);
}

main().catch((error: unknown) => {
	console.error('moveClassLessonsHome failed:', error);
	process.exit(1);
});
