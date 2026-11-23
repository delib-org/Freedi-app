/**
 * join-class (Trello btMVQMM5): moves each student's side out of the readable
 * subscription into the owner-only `classSides/{uid}--{mainId}`, and strips it
 * from the subscription. Also opens / closes the rollout window in which an app
 * version from before the change may still write those fields.
 *
 * Default is a DRY RUN (counts only). Pass --execute to write.
 *
 * Backfill (per subscription that still holds side / camp / decisionSupport):
 *   - every field the private doc does not hold yet is copied there (the private
 *     doc was written by the newer app, so it wins where both have a value);
 *     an out-of-range value is not copied;
 *   - the subscription gets `sidePickedAt` (its lastUpdate, else now) when the
 *     student had a camp and has no flag yet, and the three fields are deleted;
 *   - both writes go in one batch, so a doc is never half moved.
 * Then (decision C) it locks the sides, classSideLocks/{mainId}, of every lesson
 * that stands at Vote / Summary or has ended; other lessons lock by themselves
 * on their next move to Vote / Summary or their first totals.
 * Subscription writes carry no `lastUpdate`: a cleanup is not user activity.
 * Running it again finds nothing left to move. Output never names a student.
 * The counts are what was written, or on a dry run what would be.
 *
 * Rollout window (rules: classFlags/legacySideWrites `open: true`):
 *   --legacy-writes=open    old tabs may keep writing the fields (before deploying rules)
 *   --legacy-writes=close   delete the flag: the fields are refused (then run the backfill once more)
 *
 * The backfill refuses --execute while the window is open (old tabs would write
 * the fields straight back); pass --even-if-open to run it anyway. A dry run
 * prints the window state.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillClassSidesPrivate.ts
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillClassSidesPrivate.ts --execute
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillClassSidesPrivate.ts --legacy-writes=open --execute
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillClassSidesPrivate.ts --legacy-writes=close --execute
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import {
	FieldValue,
	getFirestore,
	type Firestore,
	type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import {
	CLASS_FLAGS_COLLECTION,
	CLASS_FLAG_LEGACY_SIDE_WRITES,
	CLASS_SIDES_COLLECTION,
	CLASS_SIDE_LOCKS_COLLECTION,
	CLASS_SIDE_PRIVATE_FIELDS,
	Collections,
} from '@freedi/shared-types';
import type { ClassSide } from '@freedi/shared-types';
import {
	planSideMove,
	shouldLockLesson,
	type LegacySubscription,
	type LessonPlanLike,
	type SideMovePlan,
} from './classSideMovePlan';

/** Subscriptions read per page (each needs two writes, a batch holds 500). */
export const SIDE_PAGE_SIZE = 200;

export interface SideBackfillReport {
	execute: boolean;
	subscriptionsWithFields: number;
	withoutIdentity: number;
	privateDocsWritten: number;
	invalidValuesDropped: number;
	flagsSet: number;
	subscriptionsStripped: number;
	lessonsScanned: number;
	lessonsLocked: number;
	lessonsAlreadyLocked: number;
}

/** Visits every subscription that still holds `field`, one page at a time. */
async function forEachPageWith(
	db: Firestore,
	field: string,
	handlePage: (docs: QueryDocumentSnapshot[]) => Promise<void>,
): Promise<void> {
	let lastDoc: QueryDocumentSnapshot | undefined;

	for (;;) {
		const page = db
			.collection(Collections.statementsSubscribe)
			.where(field, '!=', null)
			.orderBy(field)
			.limit(SIDE_PAGE_SIZE);
		const snapshot = await (lastDoc ? page.startAfter(lastDoc) : page).get();
		if (snapshot.docs.length === 0) return;

		await handlePage(snapshot.docs);

		if (snapshot.docs.length < SIDE_PAGE_SIZE) return;
		lastDoc = snapshot.docs[snapshot.docs.length - 1];
	}
}

function countPlan(report: SideBackfillReport, plan: SideMovePlan): void {
	report.invalidValuesDropped += plan.dropped;
	if (plan.privateWrite) report.privateDocsWritten += 1;
	if (plan.sidePickedAt !== null) report.flagsSet += 1;
	report.subscriptionsStripped += 1;
}

async function movePage(
	db: Firestore,
	docs: QueryDocumentSnapshot[],
	seen: Set<string>,
	report: SideBackfillReport,
	now: number,
): Promise<void> {
	const fresh = docs.filter((d) => !seen.has(d.id));
	fresh.forEach((d) => seen.add(d.id));
	report.subscriptionsWithFields += fresh.length;
	const privateRefs = fresh.map((d) => db.collection(CLASS_SIDES_COLLECTION).doc(d.id));
	const privateSnaps = privateRefs.length > 0 ? await db.getAll(...privateRefs) : [];
	const batch = db.batch();
	let writes = 0;
	fresh.forEach((d, i) => {
		const plan = planSideMove(
			d.id,
			d.data() as LegacySubscription,
			privateSnaps[i]?.data() as ClassSide | undefined,
			now,
		);
		if (!plan) {
			report.withoutIdentity += 1;

			return;
		}
		countPlan(report, plan);
		if (plan.privateWrite) batch.set(privateRefs[i], plan.privateWrite, { merge: true });
		const strip = Object.fromEntries(
			CLASS_SIDE_PRIVATE_FIELDS.map((field) => [field, FieldValue.delete()]),
		);
		batch.update(
			d.ref,
			plan.sidePickedAt === null ? strip : { ...strip, sidePickedAt: plan.sidePickedAt },
		);
		writes += 1;
	});
	if (report.execute && writes > 0) await batch.commit();
}

const STEP_INDEX_FIELD = 'statementSettings.lessonPlan.stepIndex';

/**
 * Decision C: lock the sides of every lesson that stands at Vote / Summary or
 * has ended (shouldLockLesson). An existing lock keeps its time.
 */
async function lockReachedLessons(
	db: Firestore,
	report: SideBackfillReport,
	now: number,
): Promise<void> {
	let lastDoc: QueryDocumentSnapshot | undefined;
	for (;;) {
		const page = db
			.collection(Collections.statements)
			.where(STEP_INDEX_FIELD, '>=', 0)
			.orderBy(STEP_INDEX_FIELD)
			.limit(SIDE_PAGE_SIZE);
		const snapshot = await (lastDoc ? page.startAfter(lastDoc) : page).get();
		if (snapshot.docs.length === 0) return;
		const lessons = snapshot.docs.filter((d) => {
			const settings = (d.data() as { statementSettings?: { lessonPlan?: LessonPlanLike } })
				.statementSettings;

			return shouldLockLesson(settings?.lessonPlan);
		});
		report.lessonsScanned += snapshot.docs.length;
		const lockRefs = lessons.map((d) => db.collection(CLASS_SIDE_LOCKS_COLLECTION).doc(d.id));
		const locks = lockRefs.length > 0 ? await db.getAll(...lockRefs) : [];
		const batch = db.batch();
		let writes = 0;
		lessons.forEach((d, i) => {
			if (locks[i]?.exists) {
				report.lessonsAlreadyLocked += 1;

				return;
			}
			batch.set(lockRefs[i], { mainId: d.id, lockedAt: now });
			report.lessonsLocked += 1;
			writes += 1;
		});
		if (report.execute && writes > 0) await batch.commit();
		if (snapshot.docs.length < SIDE_PAGE_SIZE) return;
		lastDoc = snapshot.docs[snapshot.docs.length - 1];
	}
}

/** Moves every legacy side. Writes only when `execute` is true. */
export async function backfillClassSidesPrivate(
	db: Firestore,
	execute: boolean,
	now: number = Date.now(),
): Promise<SideBackfillReport> {
	const report: SideBackfillReport = {
		execute,
		subscriptionsWithFields: 0,
		withoutIdentity: 0,
		privateDocsWritten: 0,
		invalidValuesDropped: 0,
		flagsSet: 0,
		subscriptionsStripped: 0,
		lessonsScanned: 0,
		lessonsLocked: 0,
		lessonsAlreadyLocked: 0,
	};
	const seen = new Set<string>();
	for (const field of CLASS_SIDE_PRIVATE_FIELDS) {
		await forEachPageWith(db, field, (docs) => movePage(db, docs, seen, report, now));
	}
	await lockReachedLessons(db, report, now);

	return report;
}

/** Is the rules' rollout window open (classFlags/legacySideWrites has open: true)? */
export async function legacyWindowOpen(db: Firestore): Promise<boolean> {
	const snap = await db.collection(CLASS_FLAGS_COLLECTION).doc(CLASS_FLAG_LEGACY_SIDE_WRITES).get();

	return snap.exists && (snap.data() as { open?: unknown } | undefined)?.open === true;
}

/** Opens or closes the rules' rollout window. Writes only when `execute` is true. */
export async function setLegacySideWrites(
	db: Firestore,
	open: boolean,
	execute: boolean,
	now: number = Date.now(),
): Promise<{ execute: boolean; open: boolean }> {
	if (execute) {
		const ref = db.collection(CLASS_FLAGS_COLLECTION).doc(CLASS_FLAG_LEGACY_SIDE_WRITES);
		if (open) await ref.set({ open: true, lastUpdate: now });
		else await ref.delete();
	}

	return { execute, open };
}

async function main(): Promise<void> {
	const project = process.env.GCLOUD_PROJECT;
	if (!project) {
		console.error(
			'Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/backfillClassSidesPrivate.ts [--legacy-writes=open|close] [--execute] [--even-if-open]',
		);
		process.exit(1);
	}
	if (getApps().length === 0) initializeApp({ projectId: project });

	const execute = process.argv.includes('--execute');
	const windowArg = process.argv.find((arg) => arg.startsWith('--legacy-writes='));
	const mode = execute ? '(EXECUTE)' : '(DRY-RUN)';
	if (windowArg) {
		const value = windowArg.split('=')[1];
		if (value !== 'open' && value !== 'close') {
			console.error('--legacy-writes must be open or close');
			process.exit(1);
		}
		const result = await setLegacySideWrites(getFirestore(), value === 'open', execute);
		console.info(
			`# legacySideWrites - project=${project} ${mode}\n` + JSON.stringify(result, null, 2),
		);

		return;
	}
	const windowOpen = await legacyWindowOpen(getFirestore());
	console.info(`# legacySideWrites window: ${windowOpen ? 'OPEN' : 'closed'}`);
	if (execute && windowOpen && !process.argv.includes('--even-if-open')) {
		console.error(
			'Refusing --execute: the legacy-writes window is open, so tabs from before the change can write the fields straight back. Close it first (--legacy-writes=close --execute), or pass --even-if-open.',
		);
		process.exit(1);
	}
	const report = await backfillClassSidesPrivate(getFirestore(), execute);
	console.info(
		`# backfillClassSidesPrivate - project=${project} ${mode}\n` +
			JSON.stringify({ ...report, legacyWindowOpen: windowOpen }, null, 2),
	);
}

if (require.main === module) {
	main().catch((error: unknown) => {
		console.error('backfillClassSidesPrivate failed:', (error as Error)?.message);
		process.exit(1);
	});
}
