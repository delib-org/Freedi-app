/**
 * READ-ONLY: scan statementsSubscribe for docs whose id is not
 * `${userId}--${statementId}` (any role), or, for elevated roles (admin,
 * statement-creator, creator), whose user.uid differs from userId. The server's
 * own admin copies (user = the statement's creator) are only COUNTED.
 * Logic in src/migrations/scanSubscriptionIdentity.ts. Never writes.
 *
 * ORDER: deploy the rules FIRST (npm run deploy:rules:prod), then run this scan,
 * delete every HIT by hand, and run the scan again until it reports 0 hits.
 * Scanning before the rules leaves the hole open between scan and deploy.
 *
 * Exit codes: 0 clean, 2 at least one HIT, 1 error / bad arguments.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/scanSubscriptionIdentity.ts [--limit=N] [--startAfter=<docId>]
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:<port> GCLOUD_PROJECT=<proj> npx tsx scripts/scanSubscriptionIdentity.ts
 *
 * In chunks: run with --limit=50000, then repeat with the --startAfter it prints
 * until it says "Reached the end of the collection."
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
	formatIdentityScan,
	identityScanExitCode,
	scanSubscriptionIdentity,
} from '../src/migrations/scanSubscriptionIdentity';
import type { IdentityScanOptions } from '../src/migrations/scanSubscriptionIdentity';

const EXIT_ERROR = 1;

function readFlag(name: string): string | undefined {
	const prefix = `--${name}=`;
	const arg = process.argv.find((a) => a.startsWith(prefix));

	return arg?.slice(prefix.length);
}

function parseOptions(): IdentityScanOptions {
	const limitArg = readFlag('limit');
	const startAfter = readFlag('startAfter');
	const options: IdentityScanOptions = {};
	if (limitArg !== undefined) {
		const limit = Number(limitArg);
		if (!Number.isInteger(limit) || limit <= 0) {
			throw new Error(`--limit must be a positive integer, got "${limitArg}"`);
		}
		options.limit = limit;
	}
	if (startAfter) options.startAfter = startAfter;

	return options;
}

async function main(): Promise<void> {
	const project = process.env.GCLOUD_PROJECT;
	if (!project) {
		console.error('Set GCLOUD_PROJECT=<project>.');
		process.exit(EXIT_ERROR);
	}
	const options = parseOptions();
	if (getApps().length === 0) initializeApp({ projectId: project });
	const result = await scanSubscriptionIdentity(getFirestore(), options);
	console.info(
		`# scan subscription identity — project=${project} (READ-ONLY)` +
			` limit=${options.limit ?? 'none'} startAfter=${options.startAfter ?? '(start)'}` +
			formatIdentityScan(result),
	);
	process.exitCode = identityScanExitCode(result);
}

main().catch((error: unknown) => {
	console.error('scanSubscriptionIdentity failed:', error);
	process.exit(EXIT_ERROR);
});
