/**
 * Lifts a quarantine (`accessScope: 'quarantined'`) from a statement and what is
 * filed under it, re-judging each statement's scope from its tree. Never sets a
 * blanket 'open'. See docs/security/access-scope-quarantine.md before running it.
 *
 * Dry run by default: prints what it would lift and what stays quarantined, and why.
 *
 * Every run must name its project, in GCLOUD_PROJECT or GOOGLE_CLOUD_PROJECT;
 * set to two different projects, it refuses to start. It also refuses when the
 * database it connected to is not the project that was checked (the same guards
 * as scripts/backfillAccessScope.ts).
 *
 * USAGE (from the repo root)
 *   - Emulator:
 *       FIRESTORE_EMULATOR_HOST=127.0.0.1:8101 GCLOUD_PROJECT=freedi-test \
 *         npx tsx scripts/liftQuarantine.ts --root=<statementId> [--execute]
 *
 *   - A real project, read-only preview:
 *       GCLOUD_PROJECT=<project> npx tsx scripts/liftQuarantine.ts --root=<statementId>
 *
 *   - A real project, writing (only freedi-test may omit --confirm-prod):
 *       GCLOUD_PROJECT=<project> npx tsx scripts/liftQuarantine.ts --root=<statementId> --execute --confirm-prod
 *
 * OPTIONS
 *   --root=ID          The statement whose quarantine is lifted, with what is under it (required)
 *   --max=N            Most statements to look at (default 5000)
 *   --allow-reused-id  Write even though the root's id was deleted from a private level
 *                      and made again (its old children may then open). Check them first.
 */

import { db } from '../functions/src/db';
import { logError } from '../functions/src/utils/errorHandling';
import { runLiftQuarantine } from '../functions/src/migrations/liftQuarantine';
import {
	checkBackfillRun,
	databaseProjectRefusal,
	resolveProjectEnv,
} from '../functions/src/migrations/backfillRunGuard';

function optionValue(name: string): string | undefined {
	const prefix = `--${name}=`;

	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function positiveNumber(name: string): number | undefined {
	const value = optionValue(name);
	if (value === undefined) return undefined;

	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1)
		throw new Error(`--${name} must be a positive whole number, got "${value}"`);

	return parsed;
}

async function main(): Promise<void> {
	const rootId = optionValue('root');
	if (!rootId) throw new Error('Name the statement: --root=<statementId>');

	const resolved = resolveProjectEnv(process.env);
	if (!resolved.ok) throw new Error(resolved.reason);

	const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
	const check = checkBackfillRun({ project: resolved.project, emulatorHost, argv: process.argv });
	if (!check.ok) throw new Error(check.reason);

	// Not in the SDK's public types; set by firebase-admin from the same project lookup.
	const databaseProject = (db as unknown as { projectId: string }).projectId;
	const refusal = databaseProjectRefusal(databaseProject, check.project);
	if (refusal) throw new Error(refusal);

	console.info(
		`Project: ${check.project} (${emulatorHost ? 'emulator' : 'REAL PROJECT'}, ${check.execute ? 'WRITE' : 'dry run'}), root ${rootId}`,
	);

	const result = await runLiftQuarantine(db, rootId, {
		execute: check.execute,
		maxStatements: positiveNumber('max'),
		allowReusedId: process.argv.includes('--allow-reused-id'),
	});

	console.info(JSON.stringify(result, null, 2));
	if (result.truncated) console.info('Stopped at --max: what is further down was not looked at.');
	if (!check.execute) console.info('Dry run: nothing written. Add --execute to write.');
}

main().catch((error: unknown) => {
	logError(error, { operation: 'scripts.liftQuarantine' });
	process.exitCode = 1;
});
