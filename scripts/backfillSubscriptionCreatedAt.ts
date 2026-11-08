/**
 * Backfill: repair the admin subscriptions the server wrote before it stored a
 * date and the real person on them.
 *
 * Members (People settings) filters on `statementType` and orders by `createdAt`,
 * so a `statementsSubscribe` doc lacking either is never listed; and
 * `createSubscription` stored the statement's creator as `user`, so an inherited
 * host's doc carried somebody else's name, photo and email. A doc qualifies when
 * `createdAt` or `statementType` is missing or `user.uid !== userId`, and only the
 * missing part is written:
 *   - createdAt: the statement's createdAt in ms, else its lastUpdate.
 *   - statementType: the live statement's, else the doc's embedded copy. Document
 *     and agreement types are stored too, and Members' filter keeps them out.
 *     A doc that would still fail the schema does not get it: the Home listener
 *     parses without a guard, and one bad doc would drop the rest of its snapshot.
 *   - user: { uid, displayName, photoURL, isAnonymous } from usersV2 and Firebase
 *     Auth. With no profile anywhere: { uid, displayName: '', isAnonymous: true },
 *     so the creator's identity still leaves the doc and the UI shows its neutral
 *     name.
 *
 * `lastUpdate` is never touched: it drives ordering and "new activity" elsewhere.
 * `parentId` and `topParentId` are not written: see subscriptionRepairEffects.ts.
 *
 * statementType also opens the doc to Home's listener, so a host can see spaces
 * and questions there that were absent. Every run prints how many, per surface:
 * read that part of a dry run before writing.
 *
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
import { Collections, getUserFeedId, StatementSubscriptionSchema } from '@freedi/shared-types';
import { FIREBASE } from '../src/constants/common';
import { convertTimestampsToMillis } from '../src/helpers/timestampHelpers';
import {
	assessSubscription,
	backfillRunRefusal,
	buildRepairPatch,
	emptyRepairCounts,
	formatRepairReport,
	RepairCandidate,
	RepairCounter,
	RepairPatch,
	resolveStatementType,
	statementDateMillis,
} from '../functions/src/migrations/subscriptionRepairPlan';
import {
	emptyEffectTally,
	isTopLevelDoc,
	MembersOutcome,
	membersFieldsAfter,
	membersOutcome,
	newlyVisibleOn,
	recordEffects,
	wouldJoinHomeListener,
} from '../functions/src/migrations/subscriptionRepairEffects';
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

const OUTCOME_COUNTERS: Readonly<Record<Exclude<MembersOutcome, 'listed'>, RepairCounter>> = {
	byType: 'hiddenByType',
	noType: 'hiddenNoType',
	noDate: 'hiddenNoDate',
	typeHeldBack: 'hiddenTypeHeldBack',
};

const counts = emptyRepairCounts();
const effects = emptyEffectTally();
const samples = new Map<string, string[]>();
const schemaIssues = new Map<string, number>();
const scannedByRole: Record<string, number> = {};
interface StatementFacts {
	date: number | undefined;
	statementType: unknown;
}
/** Each statement is read once: what the repair needs of it, or null when it is gone. */
const statementFacts = new Map<string, StatementFacts | null>();
const identities = new Map<string, PersonIdentity>();
let failedBatches = 0;

function tally(counter: RepairCounter, docId: string): void {
	counts[counter] += 1;
	const sample = samples.get(counter) ?? [];
	if (sample.length < SAMPLE_SIZE) sample.push(docId);
	samples.set(counter, sample);
}

function tallyMembersOutcome(outcome: MembersOutcome, docId: string): void {
	if (outcome !== 'listed') tally(OUTCOME_COUNTERS[outcome], docId);
}

async function loadStatementFacts(statementIds: ReadonlyArray<string>): Promise<void> {
	const missing = [...new Set(statementIds)].filter((id) => !statementFacts.has(id));
	if (missing.length === 0) return;
	const statements = db.collection(Collections.statements);
	const snaps = await db.getAll(...missing.map((id) => statements.doc(id)));
	snaps.forEach((snap, index) => {
		const data = snap.data();
		statementFacts.set(
			missing[index],
			data ? { date: statementDateMillis(data), statementType: data.statementType } : null,
		);
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

/** What the Home listener would do with this doc: parse it, unguarded. */
function homeListenerCouldParse(doc: QueryDocumentSnapshot, patch: RepairPatch): boolean {
	const repaired = convertTimestampsToMillis({ ...doc.data(), ...patch });

	return safeParse(StatementSubscriptionSchema, repaired).success;
}

/** Repaired docs with a userFeed entry are on Home today; the rest may not be. */
async function loadFeedEntries(repairs: ReadonlyArray<Assessed>): Promise<Set<string>> {
	const ids = repairs
		.filter(({ data, needsStatementType }) => needsStatementType && isTopLevelDoc(data))
		.map(({ data }) => getUserFeedId(data.userId as string, data.statementId as string));
	if (ids.length === 0) return new Set();
	const feed = db.collection(Collections.userFeed);
	const snaps = await db.getAll(...ids.map((id) => feed.doc(id)));

	return new Set(snaps.filter((snap) => snap.exists).map((snap) => snap.id));
}

interface Assessed {
	doc: QueryDocumentSnapshot;
	data: RepairCandidate;
	needsCreatedAt: boolean;
	needsUser: boolean;
	needsStatementType: boolean;
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
			tallyMembersOutcome(
				membersOutcome({
					statementType: data.statementType,
					createdAt: data.createdAt,
					typeHeldBack: false,
				}),
				doc.id,
			);

			return [];
		}

		return [
			{
				doc,
				data,
				needsCreatedAt: assessment.needsCreatedAt,
				needsUser: assessment.needsUser,
				needsStatementType: assessment.needsStatementType,
			},
		];
	});
}

async function repairPage(docs: ReadonlyArray<QueryDocumentSnapshot>): Promise<void> {
	const repairs = assessPage(docs);
	await loadStatementFacts(repairs.map(({ data }) => data.statementId as string));
	const live = repairs.filter(({ doc, data }) => {
		if (statementFacts.get(data.statementId as string) !== null) return true;
		tally('statementDeleted', doc.id);

		return false;
	});
	await loadIdentities(live.filter((r) => r.needsUser).map(({ data }) => data.userId as string));
	const feedEntries = await loadFeedEntries(live);

	const batch: WriteBatch = db.batch();
	let pending = 0;
	for (const { doc, data, needsCreatedAt, needsUser, needsStatementType } of live) {
		const uid = data.userId as string;
		const statementId = data.statementId as string;
		const facts = statementFacts.get(statementId);
		const date = facts?.date;
		const identity = identities.get(uid) ?? neutralIdentity(uid);
		const type = needsStatementType
			? resolveStatementType(facts?.statementType, data.statement?.statementType)
			: undefined;
		const proposed = buildRepairPatch(
			{ needsCreatedAt, needsUser, needsStatementType },
			date,
			identity,
			type,
		);
		const typeHeldBack = !!proposed.statementType && !homeListenerCouldParse(doc, proposed);
		const patch = typeHeldBack
			? buildRepairPatch(
					{ needsCreatedAt, needsUser, needsStatementType: false },
					date,
					identity,
					type,
				)
			: proposed;

		if (needsCreatedAt && date === undefined) tally('noStatementDate', doc.id);
		tallyMembersOutcome(
			membersOutcome({ ...membersFieldsAfter(data, patch), typeHeldBack }),
			doc.id,
		);
		const hasFeedEntry = feedEntries.has(getUserFeedId(uid, statementId));
		recordEffects(effects, newlyVisibleOn({ data, patch, hasFeedEntry }), uid, statementId);
		if (hasFeedEntry && wouldJoinHomeListener(data, patch)) effects.alreadyOnHome += 1;
		if (Object.keys(patch).length === 0) continue;

		tally('writes', doc.id);
		if (patch.createdAt !== undefined) counts.createdAtSet += 1;
		if (patch.user) {
			counts.userSet += 1;
			if (!patch.user.displayName) tally('userSetNameless', doc.id);
		}
		if (patch.statementType) counts.statementTypeSet += 1;
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
		formatRepairReport(counts, samples, schemaIssues, { dryRun, project, scannedByRole, effects }),
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
