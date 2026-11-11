/**
 * One-time release step: bring the progress counters of questions older than
 * the counters up to date. See functions/src/migrations/questionProgressBackfill.ts
 * for what it writes and why that is safe next to live triggers.
 *
 * Dry run by default. Safe to rerun: a second run writes nothing. Resumable:
 * finished questions are recorded in a state file and skipped, and if that file
 * is lost the markers still prevent any double count.
 *
 * Every run must name its project, in GCLOUD_PROJECT or GOOGLE_CLOUD_PROJECT;
 * set to two different projects, it refuses to start. It also refuses when the
 * database it connected to is not the project that was checked.
 *
 * USAGE (from the repo root)
 *   - Emulator:
 *       FIRESTORE_EMULATOR_HOST=127.0.0.1:8101 GCLOUD_PROJECT=freedi-test \
 *         npx tsx scripts/backfillQuestionProgress.ts [--execute]
 *
 *   - A real project, read-only preview (reads every rating of each old question):
 *       GCLOUD_PROJECT=<project> npx tsx scripts/backfillQuestionProgress.ts
 *
 *   - A real project, writing (only freedi-test may omit --confirm-prod):
 *       GCLOUD_PROJECT=<project> npx tsx scripts/backfillQuestionProgress.ts --execute --confirm-prod
 *
 * OPTIONS
 *   --before=YYYY-MM-DD  Questions created before this day (default: 2026-08-25)
 *   --limit=N            Stop after N questions
 *   --state=PATH         State file (default: scripts/.cache/backfillQuestionProgress[.emulator].<project>.json)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { db } from '../functions/src/db';
import {
	checkBackfillRun,
	databaseProjectRefusal,
	resolveProjectEnv,
} from '../functions/src/migrations/backfillRunGuard';
import {
	backfillStateFileName,
	COUNTERS_BEGAN_AT,
	QuestionBackfillResult,
	runQuestionProgressBackfill,
} from '../functions/src/migrations/questionProgressBackfill';

function optionValue(name: string): string | undefined {
	const prefix = `--${name}=`;

	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseBefore(): number {
	const value = optionValue('before');
	if (!value) return COUNTERS_BEGAN_AT;

	const before = Date.parse(`${value}T00:00:00Z`);
	if (Number.isNaN(before)) throw new Error(`--before must be YYYY-MM-DD, got "${value}"`);

	return before;
}

function parseLimit(): number | undefined {
	const value = optionValue('limit');
	if (value === undefined) return undefined;

	const limit = Number(value);
	if (!Number.isInteger(limit) || limit < 1)
		throw new Error(`--limit must be a positive whole number, got "${value}"`);

	return limit;
}

function loadDone(path: string): Set<string> {
	if (!existsSync(path)) return new Set();

	return new Set(JSON.parse(readFileSync(path, 'utf8')) as string[]);
}

function formatResult(result: QuestionBackfillResult): string {
	const { statementId, added, options, evaluations } = result;

	return `${statementId}: +${added.entered} entered, +${added.suggested} suggested, +${added.evaluated} evaluated, options ${options.from}->${options.to}, evaluations ${evaluations.from}->${evaluations.to}`;
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

	const before = parseBefore();
	const statePath =
		optionValue('state') ??
		join('scripts/.cache', backfillStateFileName(check.project, Boolean(emulatorHost)));
	const done = loadDone(statePath);
	console.info(
		`Project: ${check.project} (${emulatorHost ? 'emulator' : 'REAL PROJECT'}, ${check.execute ? 'WRITE' : 'dry run'}), before ${new Date(before).toISOString()}, ${done.size} already done`,
	);

	const totals = await runQuestionProgressBackfill({
		before,
		execute: check.execute,
		limit: parseLimit(),
		isDone: (statementId) => done.has(statementId),
		markDone: (statementId) => {
			done.add(statementId);
			mkdirSync(dirname(statePath), { recursive: true });
			writeFileSync(statePath, JSON.stringify([...done]));
		},
		report: (result) => {
			if (result.changed) console.info(formatResult(result));
		},
	});

	console.info(JSON.stringify(totals));
	if (totals.failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
