/**
 * Erase: sessions that ended before answers were erased on end still hold
 * everyone's position and ranked topics. Do for each of them what ending a
 * session now does, and retry any whose erase failed. Idempotent: a session
 * already erased is skipped. Run once per project, after the new functions are
 * live.
 *
 * Every run must name its project: unset, firebase-admin would use the ADC default.
 *
 * USAGE (from the repo root)
 *   GCLOUD_PROJECT=<project> npx tsx scripts/eraseEndedTablesAnswers.ts --dry-run
 *   GCLOUD_PROJECT=<project> npx tsx scripts/eraseEndedTablesAnswers.ts --confirm-prod
 *   (with FIRESTORE_EMULATOR_HOST set, no --confirm-prod is needed)
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import type { TableAssignment } from '@freedi/shared-types';
import { eraseSessionAnswers } from '../functions/src/tableAssignment/sessionData';

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
	const ended = await firestore
		.collection(Collections.tableAssignments)
		.where('status', '==', 'ended')
		.get();
	const pending = ended.docs
		.map((doc) => doc.data() as TableAssignment)
		.filter((session) => session.answersErasedAt === undefined);

	console.info(
		`${project} (${onEmulator ? 'emulator' : 'REAL PROJECT'}): ${ended.size} ended, ${pending.length} to erase`,
	);
	if (dryRun) {
		console.info('Dry run: nothing written.');

		return;
	}
	for (const session of pending) {
		await eraseSessionAnswers(firestore, session, Date.now());
		console.info(`Erased ${session.tableAssignmentId}`);
	}
	console.info('Done.');
}

const refusal = refusalReason();

if (refusal) {
	console.error(refusal);
	process.exit(1);
}
main().catch((error: unknown) => {
	console.error('eraseEndedTablesAnswers failed', error);
	process.exit(1);
});
