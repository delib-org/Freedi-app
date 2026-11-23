/**
 * join-class (Trello sN881XCU): sets `statementSettings.studentCount` on every
 * Class lesson, for the lessons already running when the count went live. The
 * triggers keep it from then on (fn_subscriptionLifecycle, and the scheduled
 * syncCountersSchedule for lessons with a recent join); a lesson nobody joins
 * or leaves after the deploy would otherwise show "0 joined" on the phones.
 *
 * Default is a DRY RUN (counts only). Pass --execute to write.
 *
 * Per statement with a lesson plan (`statementSettings.lessonPlan.stepIndex`
 * set), one page at a time:
 *   - a class home or a statement that is not a lesson is skipped;
 *   - its students are counted from scratch, the same count the server keeps
 *     (countClassStudents: every subscription that is not a teacher's);
 *   - the count is written only when the stored one differs (classStudentCountPlan),
 *     so a second run writes nothing.
 * Writes carry no `lastUpdate`: a recount is not activity, and bumping it would
 * float every old lesson to the top of the teacher's lists. join-class reads
 * the lesson through a document listener, so the change still reaches it.
 * Output names no student, only counts.
 *
 * Deploy the functions first: then a join racing this script is recounted by
 * its own trigger, and whichever lands last is a from-scratch count.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillClassStudentCount.ts
 *   GCLOUD_PROJECT=<proj> npx tsx scripts/backfillClassStudentCount.ts --execute
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { countClassStudents, STUDENT_COUNT_FIELD } from '../src/classroom/classStudentCount';
import { needsStudentCount, planStudentCount, type LessonLike } from './classStudentCountPlan';

/** Lessons read per page; a batch of their updates stays under the 500-write limit. */
export const LESSON_PAGE_SIZE = 200;
/** Lessons counted at once (two count() aggregations each). */
const COUNT_CONCURRENCY = 20;

const STEP_INDEX_FIELD = 'statementSettings.lessonPlan.stepIndex';

export interface StudentCountBackfillReport {
	execute: boolean;
	statementsScanned: number;
	notLessons: number;
	alreadyRight: number;
	written: number;
	countFailed: number;
}

interface Counted {
	doc: QueryDocumentSnapshot;
	count: number | null;
}

async function countPage(db: Firestore, docs: QueryDocumentSnapshot[]): Promise<Counted[]> {
	const counted: Counted[] = [];
	for (let i = 0; i < docs.length; i += COUNT_CONCURRENCY) {
		const chunk = docs.slice(i, i + COUNT_CONCURRENCY);
		const results = await Promise.allSettled(chunk.map((d) => countClassStudents(db, d.id)));
		results.forEach((result, j) => {
			if (result.status === 'rejected') {
				console.error(
					JSON.stringify({
						operation: 'backfillClassStudentCount.count',
						statementId: chunk[j].id,
						error: (result.reason as Error)?.message,
					}),
				);
			}
			counted.push({ doc: chunk[j], count: result.status === 'fulfilled' ? result.value : null });
		});
	}

	return counted;
}

async function recountPage(
	db: Firestore,
	docs: QueryDocumentSnapshot[],
	report: StudentCountBackfillReport,
): Promise<void> {
	report.statementsScanned += docs.length;
	const lessons = docs.filter((d) => needsStudentCount(d.data() as LessonLike));
	report.notLessons += docs.length - lessons.length;

	const batch = db.batch();
	let writes = 0;
	for (const { doc, count } of await countPage(db, lessons)) {
		if (count === null) {
			report.countFailed += 1;
			continue;
		}
		const plan = planStudentCount(doc.data() as LessonLike, count);
		if (plan.action === 'unchanged') report.alreadyRight += 1;
		if (plan.action !== 'write') continue;
		batch.update(doc.ref, { [STUDENT_COUNT_FIELD]: plan.count });
		report.written += 1;
		writes += 1;
	}
	if (report.execute && writes > 0) await batch.commit();
}

/** Recounts every lesson. Writes only when `execute` is true. */
export async function backfillClassStudentCount(
	db: Firestore,
	execute: boolean,
): Promise<StudentCountBackfillReport> {
	const report: StudentCountBackfillReport = {
		execute,
		statementsScanned: 0,
		notLessons: 0,
		alreadyRight: 0,
		written: 0,
		countFailed: 0,
	};
	let lastDoc: QueryDocumentSnapshot | undefined;
	for (;;) {
		const page = db
			.collection(Collections.statements)
			.where(STEP_INDEX_FIELD, '>=', 0)
			.orderBy(STEP_INDEX_FIELD)
			.limit(LESSON_PAGE_SIZE);
		const snapshot = await (lastDoc ? page.startAfter(lastDoc) : page).get();
		if (snapshot.docs.length === 0) break;

		await recountPage(db, snapshot.docs, report);

		if (snapshot.docs.length < LESSON_PAGE_SIZE) break;
		lastDoc = snapshot.docs[snapshot.docs.length - 1];
	}

	return report;
}

async function main(): Promise<void> {
	const project = process.env.GCLOUD_PROJECT;
	if (!project) {
		console.error(
			'Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/backfillClassStudentCount.ts [--execute]',
		);
		process.exit(1);
	}
	if (getApps().length === 0) initializeApp({ projectId: project });

	const execute = process.argv.includes('--execute');
	const mode = execute ? '(EXECUTE)' : '(DRY-RUN)';
	const report = await backfillClassStudentCount(getFirestore(), execute);
	console.info(
		`# backfillClassStudentCount - project=${project} ${mode}\n` + JSON.stringify(report, null, 2),
	);
	if (report.countFailed > 0) process.exitCode = 1;
}

if (require.main === module) {
	main().catch((error: unknown) => {
		console.error('backfillClassStudentCount failed:', (error as Error)?.message);
		process.exit(1);
	});
}
