/**
 * Scrub: runs computed before the privacy hardening hold exact position figures
 * and an input hash that a host or participant can read. Coarsen every run the
 * way the functions now do, drop the figures from published runs, and move the
 * hash where no client reads it. Idempotent. Run once per project, after the
 * new functions are live.
 *
 * Every run must name its project: unset, firebase-admin would use the ADC default.
 *
 * USAGE (from the repo root)
 *   GCLOUD_PROJECT=<project> npx tsx scripts/scrubTablesRunMetrics.ts --dry-run
 *   GCLOUD_PROJECT=<project> npx tsx scripts/scrubTablesRunMetrics.ts --confirm-prod
 *   (with FIRESTORE_EMULATOR_HOST set, no --confirm-prod is needed)
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import type { TableAssignmentRun } from '@freedi/shared-types';
import { FIREBASE } from '../src/constants/common';
import { scrubStoredRun } from '../functions/src/tableAssignment/runPrivacy';
import { runInputRef } from '../functions/src/tableAssignment/tablesAccess';

const dryRun = process.argv.includes('--dry-run');
const confirmProd = process.argv.includes('--confirm-prod');
const onEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const project = process.env.GCLOUD_PROJECT?.trim() ?? '';

function refusalReason(): string | undefined {
	if (!project) return 'Set GCLOUD_PROJECT.';
	if (!dryRun && !onEmulator && !confirmProd) {
		return `Writing to the real project ${project} needs --confirm-prod.`;
	}

	return undefined;
}

async function main(): Promise<void> {
	if (getApps().length === 0) initializeApp({ projectId: project });
	const firestore = getFirestore();
	const runs = await firestore.collection(Collections.tableAssignmentRuns).get();

	console.info(`${project} (${onEmulator ? 'emulator' : 'REAL PROJECT'}): ${runs.size} runs`);
	if (dryRun) {
		console.info('Dry run: nothing written.');

		return;
	}
	// Each run writes two documents, so a batch holds half the Firestore limit.
	const batchRuns = Math.floor(FIREBASE.BATCH_SIZE / 2);

	for (let start = 0; start < runs.docs.length; start += batchRuns) {
		const batch = firestore.batch();

		runs.docs.slice(start, start + batchRuns).forEach((doc) => {
			const run = doc.data() as TableAssignmentRun;

			if (run.inputHash) {
				batch.set(runInputRef(firestore, doc.id), {
					sessionId: run.sessionId,
					inputHash: run.inputHash,
				});
			}
			batch.update(doc.ref, { ...scrubStoredRun(run), inputHash: '' });
		});
		await batch.commit();
	}
	console.info('Done.');
}

const refusal = refusalReason();

if (refusal) {
	console.error(refusal);
	process.exit(1);
}
main().catch((error: unknown) => {
	console.error('scrubTablesRunMetrics failed', error);
	process.exit(1);
});
