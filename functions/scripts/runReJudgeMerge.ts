/**
 * Emulator pump for the cross-synth reJudge sweep.
 *
 * The production sweep is `onSchedule('every 10 minutes')` and does not fire in
 * the emulator, so duplicate synths the live pipeline created never get merged
 * locally and the accuracy benchmark would measure a structure production would
 * never ship.
 *
 * This script now CALLS the production sweep — `reJudgeProcessParent` from
 * `src/synthesis/scheduled/fn_synthesisReJudge.ts` — rather than reproducing it.
 *
 * It used to be a "faithful re-implementation", and that stopped being true the
 * moment the production sweep gained an LLM merge gate. The benchmark reported
 * zero merge refusals, which read as "the gate approved the bad merges" when in
 * fact the gate never ran: the pump was still merging on cosine alone. A harness
 * that re-implements the code under test measures the copy, and the divergence
 * is invisible precisely when it matters most — right after a fix lands. Whatever
 * the sweep does (LLM gating, theme consolidation, anything added later) is now
 * exercised here by construction.
 *
 * USAGE (from functions/):
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/runReJudgeMerge.ts <questionId>
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, type Statement } from '@freedi/shared-types';
import { reJudgeProcessParent } from '../src/synthesis/scheduled/fn_synthesisReJudge';

/**
 * The sweep calls an LLM, so it needs the same key the functions runtime has.
 * `functions/.env` is generated — regenerate with `npm run env:dev`, never edit.
 */
function loadEnv(): void {
	const envPath = resolve(__dirname, '../.env');
	if (!existsSync(envPath)) return;
	for (const line of readFileSync(envPath, 'utf8').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (!(key in process.env)) process.env[key] = value;
	}
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set. Emulator-only.');
	process.exit(1);
}
const parentId = process.argv[2];
if (!parentId) {
	console.error('Usage: npx tsx scripts/runReJudgeMerge.ts <questionId>');
	process.exit(1);
}
loadEnv();
if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}

async function main(): Promise<void> {
	const db = getFirestore();
	const snap = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('derivedByPipeline', '==', 'synthesis')
		.where('hide', '==', false)
		.get();

	const synths = snap.docs.map((d) => d.data() as Statement);
	console.info(`Found ${synths.length} non-hidden synths under ${parentId}:`);
	for (const s of synths) {
		console.info(
			`  ${s.statementId} (${(s.integratedOptions ?? []).length}) ${(s.statement ?? '').slice(0, 50)}`,
		);
	}

	// Called even with fewer than 2 synths: the sweep also consolidates THEMES,
	// which is independent of how many syntheses exist.
	const result = await reJudgeProcessParent(parentId, synths);
	console.info(`\nDone. ${result.merges} synth merge(s).`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('reJudge merge failed:', e);
		process.exit(1);
	});
