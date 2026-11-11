/**
 * Backfill: give every existing Tables registration its name card and every
 * session its registered count (build map, section 0).
 *
 * Without it, hosts of sessions that are live at deploy time see no names and
 * published participants see no tablemates. Run once per project, after the new
 * functions are live and before the Tables rules deploy. Every write is derived
 * from tableAssignmentParticipants, so a second run corrects anything a
 * registration racing the first run left off by one.
 *
 * Every run must name its project: unset, firebase-admin would use the ADC default.
 *
 * USAGE (from the repo root)
 *   - Local emulator:
 *       FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 GCLOUD_PROJECT=freedi-test \
 *         npx tsx scripts/backfillTablesRoster.ts [--dry-run]
 *   - A real project, read-only preview:
 *       GCLOUD_PROJECT=<project> npx tsx scripts/backfillTablesRoster.ts --dry-run
 *   - A real project (read-write):
 *       GCLOUD_PROJECT=<project> npx tsx scripts/backfillTablesRoster.ts --confirm-prod
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { DocumentReference, DocumentData } from 'firebase-admin/firestore';
import { Collections, tableAssignmentParticipantId } from '@freedi/shared-types';
import type { TableAssignmentParticipant } from '@freedi/shared-types';
import { FIREBASE } from '../src/constants/common';
import { planRosterBackfill } from '../functions/src/tableAssignment/roster';

interface PlannedWrite {
	ref: DocumentReference;
	data: DocumentData;
}

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

async function commitInBatches(
	firestore: FirebaseFirestore.Firestore,
	writes: readonly PlannedWrite[],
): Promise<void> {
	for (let start = 0; start < writes.length; start += FIREBASE.BATCH_SIZE) {
		const batch = firestore.batch();
		writes
			.slice(start, start + FIREBASE.BATCH_SIZE)
			.forEach(({ ref, data }) => batch.set(ref, data));
		await batch.commit();
	}
}

async function main(): Promise<void> {
	if (getApps().length === 0) initializeApp({ projectId: project });
	const firestore = getFirestore();
	const [sessions, participants] = await Promise.all([
		firestore.collection(Collections.tableAssignments).get(),
		firestore.collection(Collections.tableAssignmentParticipants).get(),
	]);
	const { entries, counters } = planRosterBackfill(
		sessions.docs.map((d) => d.id),
		participants.docs.map((d) => d.data() as TableAssignmentParticipant),
	);
	console.info(
		`${project} (${onEmulator ? 'emulator' : 'REAL PROJECT'}): ${entries.length} name cards, ${counters.length} counters`,
	);
	if (dryRun) {
		console.info('Dry run: nothing written.');

		return;
	}
	const rosterCollection = firestore.collection(Collections.tableAssignmentRoster);
	const countersCollection = firestore.collection(Collections.tableAssignmentCounters);
	await commitInBatches(firestore, [
		...entries.map((data) => ({
			ref: rosterCollection.doc(tableAssignmentParticipantId(data.sessionId, data.uid)),
			data,
		})),
		...counters.map((data) => ({ ref: countersCollection.doc(data.sessionId), data })),
	]);
	console.info('Done.');
}

const refusal = refusalReason();
if (refusal) {
	console.error(refusal);
	process.exit(1);
}
main().catch((error: unknown) => {
	console.error('backfillTablesRoster failed', error);
	process.exit(1);
});
