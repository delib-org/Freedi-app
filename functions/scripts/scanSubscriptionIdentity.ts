/**
 * READ-ONLY: list statementsSubscribe docs with an elevated role (admin,
 * statement-creator, creator) whose id is not `${userId}--${statementId}` or whose
 * user.uid differs from userId. Run on production BEFORE deploying the rules that
 * tie a subscription's id to its contents; delete every HIT by hand. Exits 2 on any
 * hit. Logic in src/migrations/scanSubscriptionIdentity.ts. Never writes.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/scanSubscriptionIdentity.ts
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:<port> GCLOUD_PROJECT=<proj> npx tsx scripts/scanSubscriptionIdentity.ts
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
	formatIdentityScan,
	scanSubscriptionIdentity,
} from '../src/migrations/scanSubscriptionIdentity';

async function main(): Promise<void> {
	const project = process.env.GCLOUD_PROJECT;
	if (!project) {
		console.error('Set GCLOUD_PROJECT=<project>.');
		process.exit(1);
	}
	if (getApps().length === 0) initializeApp({ projectId: project });
	const findings = await scanSubscriptionIdentity(getFirestore());
	console.info(
		`# scan subscription identity — project=${project} (READ-ONLY)${formatIdentityScan(findings)}`,
	);
	if (findings.some((f) => f.verdict === 'hit')) process.exitCode = 2;
}

main().catch((error: unknown) => {
	console.error('scanSubscriptionIdentity failed:', error);
	process.exit(1);
});
