/**
 * Backfill: repair the admin subscriptions the server wrote before it stored a
 * date and the real person on them.
 *
 * Members (People settings) orders by `createdAt`, so a `statementsSubscribe`
 * doc without one is never listed; and `createSubscription` stored the
 * statement's creator as `user`, so an inherited host's doc carried somebody
 * else's name, photo and email. A doc qualifies when `createdAt` is missing or
 * `user.uid !== userId`, and only the missing part is written:
 *   - createdAt: the statement's createdAt in ms, else its lastUpdate.
 *   - user: { uid, displayName, photoURL, isAnonymous } from usersV2 and Firebase
 *     Auth. With no profile anywhere: { uid, displayName: '', isAnonymous: true },
 *     so the creator's identity still leaves the doc and the UI shows its neutral
 *     name.
 *
 * `lastUpdate` is never touched: it drives ordering and "new activity" elsewhere.
 * Idempotent: a second run writes nothing. Elevated roles only, since Firestore
 * cannot query a missing field; a demoted host's doc is not covered.
 * Docs whose id disagrees with their fields are skipped and counted: they are
 * for scanSubscriptionIdentity, not for repair.
 *
 * Every run must name its project: unset, firebase-admin would use the ADC default.
 *
 * USAGE (from the repo root)
 *   - Local emulator (both hosts are required, so Auth never reaches a real project):
 *       FIRESTORE_EMULATOR_HOST=127.0.0.1:8091 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9109 \
 *         GCLOUD_PROJECT=freedi-test npx tsx scripts/backfillSubscriptionCreatedAt.ts [--dry-run]
 *
 *   - A real project, read-only preview (no --confirm-prod needed):
 *       GCLOUD_PROJECT=<project> npx tsx scripts/backfillSubscriptionCreatedAt.ts --dry-run
 *
 *   - A real project (read-write):
 *       gcloud auth application-default login
 *       GCLOUD_PROJECT=<project> npx tsx scripts/backfillSubscriptionCreatedAt.ts --confirm-prod
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
	FieldPath,
	getFirestore,
	QueryDocumentSnapshot,
	WriteBatch,
} from 'firebase-admin/firestore';
import { safeParse } from 'valibot';
import { Collections, StatementSubscriptionSchema } from '@freedi/shared-types';
import { FIREBASE } from '../src/constants/common';
import {
	assessSubscription,
	backfillRunRefusal,
	buildRepairPatch,
	emptyRepairCounts,
	formatRepairReport,
	RepairCandidate,
	RepairCounter,
	statementDateMillis,
} from '../functions/src/migrations/subscriptionRepairPlan';
import { ELEVATED_ROLES } from '../functions/src/utils/subscriptionIdentity';
import {
	lookupPersonIdentities,
	neutralIdentity,
	PersonIdentity,
} from '../functions/src/utils/personIdentity';

const dryRun = process.argv.includes('--dry-run');
const firestoreEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const project = process.env.GCLOUD_PROJECT?.trim() ?? '';
const refusal = backfillRunRefusal({
	project,
	firestoreEmulator,
	authEmulator: Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST),
	dryRun,
	confirmProd: process.argv.includes('--confirm-prod'),
});
if (refusal) {
	console.error(refusal);
	process.exit(1);
}
console.info(
	`Project: ${project} (${firestoreEmulator ? 'emulator' : 'REAL PROJECT'}, ${dryRun ? 'dry run' : 'WRITE'})`,
);

if (getApps().length === 0) initializeApp({ projectId: project });
const db = getFirestore();
const auth = getAuth();

const SAMPLE_SIZE = 5;

const counts = emptyRepairCounts();
const samples = new Map<string, string[]>();
const schemaIssues = new Map<string, number>();
const scannedByRole: Record<string, number> = {};
/** Each statement is read once: its date, or null when it is gone. */
const statementDates = new Map<string, number | undefined | null>();
const identities = new Map<string, PersonIdentity>();
let failedBatches = 0;

function tally(counter: RepairCounter, docId: string): void {
	counts[counter] += 1;
	const sample = samples.get(counter) ?? [];
	if (sample.length < SAMPLE_SIZE) sample.push(docId);
	samples.set(counter, sample);
}

async function loadStatementDates(statementIds: ReadonlyArray<string>): Promise<void> {
	const missing = [...new Set(statementIds)].filter((id) => !statementDates.has(id));
	if (missing.length === 0) return;
	const statements = db.collection(Collections.statements);
	const snaps = await db.getAll(...missing.map((id) => statements.doc(id)));
	snaps.forEach((snap, index) => {
		const data = snap.data();
		statementDates.set(missing[index], data ? statementDateMillis(data) : null);
	});
}

async function loadIdentities(uids: ReadonlyArray<string>): Promise<void> {
	const missing = [...new Set(uids)].filter((uid) => !identities.has(uid));
	const found = await lookupPersonIdentities(db, auth, missing);
	missing.forEach((uid) => identities.set(uid, found.get(uid) ?? neutralIdentity(uid)));
}

/** Both triggers parse this schema on every update of the doc; count who fails it. */
function countSchemaFailure(doc: QueryDocumentSnapshot): void {
	const parsed = safeParse(StatementSubscriptionSchema, doc.data());
	if (parsed.success) return;
	tally('schemaInvalid', doc.id);
	const path =
		parsed.issues[0]?.path?.map((item: { key: unknown }) => String(item.key)).join('.') ??
		'(document)';
	schemaIssues.set(path, (schemaIssues.get(path) ?? 0) + 1);
}

interface Assessed {
	doc: QueryDocumentSnapshot;
	data: RepairCandidate;
	needsCreatedAt: boolean;
	needsUser: boolean;
}

function assessPage(docs: ReadonlyArray<QueryDocumentSnapshot>): Assessed[] {
	return docs.flatMap((doc) => {
		const data = doc.data() as RepairCandidate;
		const assessment = assessSubscription(doc.id, data);
		counts.scanned += 1;
		if (assessment.kind === 'id-mismatch') {
			tally('idMismatch', doc.id);

			return [];
		}
		if (assessment.hasNonNumberCreatedAt) tally('nonNumberCreatedAt', doc.id);
		if (assessment.kind === 'current') {
			counts.current += 1;

			return [];
		}

		return [
			{
				doc,
				data,
				needsCreatedAt: assessment.needsCreatedAt,
				needsUser: assessment.needsUser,
			},
		];
	});
}

async function repairPage(docs: ReadonlyArray<QueryDocumentSnapshot>): Promise<void> {
	const repairs = assessPage(docs);
	await loadStatementDates(repairs.map(({ data }) => data.statementId as string));
	const live = repairs.filter(({ doc, data }) => {
		if (statementDates.get(data.statementId as string) !== null) return true;
		tally('statementDeleted', doc.id);

		return false;
	});
	await loadIdentities(live.filter((r) => r.needsUser).map(({ data }) => data.userId as string));

	const batch: WriteBatch = db.batch();
	let pending = 0;
	for (const { doc, data, needsCreatedAt, needsUser } of live) {
		const uid = data.userId as string;
		const date = statementDates.get(data.statementId as string) ?? undefined;
		const identity = identities.get(uid) ?? neutralIdentity(uid);
		const patch = buildRepairPatch({ needsCreatedAt, needsUser }, date, identity);

		if (needsCreatedAt && date === undefined) tally('noStatementDate', doc.id);
		if (Object.keys(patch).length === 0) continue;

		tally('writes', doc.id);
		if (patch.createdAt !== undefined) counts.createdAtSet += 1;
		if (patch.user) {
			counts.userSet += 1;
			if (!patch.user.displayName) tally('userSetNameless', doc.id);
		}
		if (!doc.get('statementType')) tally('noStatementType', doc.id);
		countSchemaFailure(doc);
		if (!dryRun) {
			batch.update(doc.ref, { ...patch });
			pending += 1;
		}
	}

	if (pending === 0) return;
	try {
		await batch.commit();
	} catch (error) {
		// One doc deleted since the read fails its whole batch. Idempotent, so the
		// run goes on and a re-run picks up what this batch held.
		failedBatches += 1;
		console.error(`A batch of ${pending} failed:`, error);
	}
}

async function scanRole(role: string): Promise<void> {
	let cursor: QueryDocumentSnapshot | undefined;
	for (;;) {
		let query = db
			.collection(Collections.statementsSubscribe)
			.where('role', '==', role)
			.orderBy(FieldPath.documentId())
			.limit(FIREBASE.BATCH_SIZE);
		if (cursor) query = query.startAfter(cursor);
		const page = await query.get();
		if (page.empty) return;
		scannedByRole[role] = (scannedByRole[role] ?? 0) + page.size;
		await repairPage(page.docs);
		if (page.size < FIREBASE.BATCH_SIZE) return;
		cursor = page.docs[page.size - 1];
	}
}

async function main(): Promise<void> {
	for (const role of ELEVATED_ROLES) await scanRole(role);

	console.info(
		formatRepairReport(counts, samples, schemaIssues, { dryRun, project, scannedByRole }),
	);
	if (failedBatches > 0) {
		console.error(`${failedBatches} batch(es) failed: run it again.`);
		process.exit(1);
	}
}

main().catch((error: unknown) => {
	console.error('Backfill failed:', error);
	process.exit(1);
});
