import type { Firestore } from 'firebase-admin/firestore';
import { Collections, isClassLesson, studentCountOf } from '@freedi/shared-types';
import type { Statement, StatementSubscription } from '@freedi/shared-types';
import { ADMIN_ROLES } from './classroomAccess';

/**
 * `statementSettings.studentCount` on a Class lesson (Trello sN881XCU).
 *
 * A student's phone may read only its own table's subscriptions, so it can no
 * longer count the class from the roster (the waiting screen's "N joined",
 * the turnout under the vote). The server counts instead: every subscription
 * of the lesson that is not a teacher's, banned included, and one with no
 * role at all (the old phone count, `role !== admin`, kept those too).
 *
 * Always a from-scratch recount, never an increment, so a retried or late
 * trigger cannot drift the number; whichever recount lands last is at most
 * one join behind, and the scheduled pass (progress/syncQuestionCounterCopies)
 * recounts lessons that had a join in its window.
 *
 * Who writes it:
 * - a join or leave: `updateMemberCount` (fn_subscriptionLifecycle), in the
 *   same lesson write as `numberOfMembers`, judged on the lesson it already
 *   read (not on the subscription's copy, which may predate the lesson plan);
 * - a role change across the teacher line: `updateClassStudentCount`;
 * - the scheduled repair, and the one-off scripts/backfillClassStudentCount.ts.
 */

type SubscriptionRole = Partial<Pick<StatementSubscription, 'role'>>;

/** The patch key; a dotted path, so `update()` keeps the other settings. */
export const STUDENT_COUNT_FIELD = 'statementSettings.studentCount';

export type StudentCountPatch = { [STUDENT_COUNT_FIELD]?: number };

/** A teacher (admin / creator, current or legacy spelling); anyone else is counted. */
function isTeacherRole(role: unknown): boolean {
	return typeof role === 'string' && ADMIN_ROLES.has(role);
}

/**
 * Students of a lesson: all its subscriptions minus the teachers'. Two count()
 * aggregations (one read each per 1000 entries) rather than `role not-in`,
 * which would skip a subscription that has no `role` field.
 */
export async function countClassStudents(firestore: Firestore, mainId: string): Promise<number> {
	const ofLesson = firestore
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', mainId);
	const [all, teachers] = await Promise.all([
		ofLesson.count().get(),
		ofLesson
			.where('role', 'in', [...ADMIN_ROLES])
			.count()
			.get(),
	]);

	return Math.max(0, all.data().count - teachers.data().count);
}

/**
 * What to merge into the lesson's update so its student count is exact: the
 * count when it moved, nothing when it is right or the statement is not a
 * lesson (no query is run for a non-lesson).
 */
export async function classStudentCountPatch(
	firestore: Firestore,
	mainId: string,
	statement: Statement | undefined,
): Promise<StudentCountPatch> {
	if (!isClassLesson(statement)) return {};
	const count = await countClassStudents(firestore, mainId);

	return studentCountOf(statement) === count ? {} : { [STUDENT_COUNT_FIELD]: count };
}

/** A role change that moves someone into or out of the count. */
export function changesStudentCount(before: SubscriptionRole, after: SubscriptionRole): boolean {
	return isTeacherRole(before.role) !== isTeacherRole(after.role);
}

/**
 * Recounts a lesson's students and stores the number when it moved; for a
 * role change, the one event that does not go through `updateMemberCount`.
 * Reads the lesson itself rather than trusting the subscription's copy, so a
 * copy taken before the lesson plan existed still counts. A plain update, not
 * a transaction: the count is from scratch, so the last write is right up to
 * a concurrent join, and that join's own recount follows.
 * Returns the count, or null when the statement is missing or not a lesson.
 */
export async function updateClassStudentCount(
	firestore: Firestore,
	mainId: string,
): Promise<number | null> {
	const lessonRef = firestore.collection(Collections.statements).doc(mainId);
	const lessonSnap = await lessonRef.get();
	if (!lessonSnap.exists) return null;
	const lesson = lessonSnap.data() as Statement;
	if (!isClassLesson(lesson)) return null;

	const patch = await classStudentCountPatch(firestore, mainId, lesson);
	const count = patch[STUDENT_COUNT_FIELD];
	if (count === undefined) return studentCountOf(lesson);

	await lessonRef.update({ ...patch, lastUpdate: Date.now() });

	return count;
}
