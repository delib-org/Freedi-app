/**
 * One-time release step: stamp `accessScope` on every existing statement. See
 * functions/src/migrations/backfillAccessScope.ts for what it writes and why.
 *
 * Must finish before the rules that read `accessScope` are deployed: a statement
 * without the field is invisible to every scoped list.
 *
 * Dry run by default. Safe to rerun: a correct statement is not written.
 * Resumable: the last statement reached is kept in a state file; if that file is
 * lost the rerun rescans and writes nothing it already wrote.
 *
 * Every run must name its project, in GCLOUD_PROJECT or GOOGLE_CLOUD_PROJECT;
 * set to two different projects, it refuses to start. It also refuses when the
 * database it connected to is not the project that was checked.
 *
 * USAGE (from the repo root)
 *   - Emulator:
 *       FIRESTORE_EMULATOR_HOST=127.0.0.1:8101 GCLOUD_PROJECT=freedi-test \
 *         npx tsx scripts/backfillAccessScope.ts [--execute]
 *
 *   - A real project, read-only preview (reads every statement):
 *       GCLOUD_PROJECT=<project> npx tsx scripts/backfillAccessScope.ts
 *
 *   - A real project, writing (only freedi-test may omit --confirm-prod):
 *       GCLOUD_PROJECT=<project> npx tsx scripts/backfillAccessScope.ts --execute --confirm-prod
 *
 * OPTIONS
 *   --limit=N   Stop after scanning N statements
 *   --rate=N    Most statements written per second (default 50). Each write
 *               starts 19 triggers, so this caps them at 19 x N per second.
 *   --state=PATH  State file (default: scripts/.cache/backfillAccessScope[.emulator].<project>.json)
 *   --restart   Ignore the state file and start from the beginning
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { db } from '../functions/src/db';
import {
	backfillStateFileName,
	estimateBackfillCost,
	runAccessScopeBackfill,
} from '../functions/src/migrations/backfillAccessScope';
import {
	checkBackfillRun,
	databaseProjectRefusal,
	resolveProjectEnv,
} from '../functions/src/migrations/backfillRunGuard';

const DEFAULT_WRITES_PER_SECOND = 50;

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

function loadCursor(path: string): string | null {
	if (process.argv.includes('--restart') || !existsSync(path)) return null;

	return (JSON.parse(readFileSync(path, 'utf8')) as { cursor: string | null }).cursor;
}

async function main(): Promise<void> {
	const resolved = resolveProjectEnv(process.env);
	if (!resolved.ok) throw new Error(resolved.reason);

	const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
	const check = checkBackfillRun({ project: resolved.project, emulatorHost, argv: process.argv });
	if (!check.ok) throw new Error(check.reason);

	// Not in the SDK's public types; set by firebase-admin from the same project lookup.
	const databaseProject = (db as unknown as { projectId: string }).projectId;
	const refusal = databaseProjectRefusal(databaseProject, check.project);
	if (refusal) throw new Error(refusal);

	const statePath =
		optionValue('state') ??
		join('scripts/.cache', backfillStateFileName(check.project, Boolean(emulatorHost)));
	// A dry run never moves the cursor, so it cannot make a later write skip anything.
	const cursor = check.execute ? loadCursor(statePath) : null;
	console.info(
		`Project: ${check.project} (${emulatorHost ? 'emulator' : 'REAL PROJECT'}, ${check.execute ? 'WRITE' : 'dry run'}), from ${cursor ?? 'the start'}`,
	);

	const result = await runAccessScopeBackfill(db, {
		execute: check.execute,
		cursor,
		limit: positiveNumber('limit'),
		writesPerSecond: positiveNumber('rate') ?? DEFAULT_WRITES_PER_SECOND,
		onPage: (progress) => {
			if (check.execute) {
				mkdirSync(dirname(statePath), { recursive: true });
				writeFileSync(statePath, JSON.stringify({ cursor: progress.cursor }));
			}
			console.info(`${progress.scanned} scanned, ${progress.toWrite} to write`);
		},
	});

	console.info(JSON.stringify(result));
	console.info(`Full run cost: ${JSON.stringify(estimateBackfillCost(result.toWrite, result.ancestorReads))}`);
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
