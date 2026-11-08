/**
 * READ-ONLY: list statements whose id starts with jcClass_ / jcTeacher_ and judge
 * each one (genuine server home, or a squat). Run on production BEFORE deploying
 * the lesson-plan rules; delete any squat by hand before classStartLesson is used.
 * Logic in src/migrations/scanClassHomeIds.ts. Never writes, so it needs no
 * --execute / --confirm-prod.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/scanClassHomeIds.ts
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:<port> GCLOUD_PROJECT=<proj> npx tsx scripts/scanClassHomeIds.ts
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { formatHomeIdScan, scanClassHomeIds } from '../src/migrations/scanClassHomeIds';

async function main(): Promise<void> {
	const project = process.env.GCLOUD_PROJECT;
	if (!project) {
		console.error('Set GCLOUD_PROJECT=<project>.');
		process.exit(1);
	}
	if (getApps().length === 0) initializeApp({ projectId: project });
	const findings = await scanClassHomeIds(getFirestore());
	console.info(
		`# scan class home ids — project=${project} (READ-ONLY)${formatHomeIdScan(findings)}`,
	);
	if (findings.some((f) => f.verdict === 'squat')) process.exitCode = 2;
}

main().catch((error: unknown) => {
	console.error('scanClassHomeIds failed:', error);
	process.exit(1);
});
