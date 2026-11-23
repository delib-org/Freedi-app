import type { Firestore } from 'firebase-admin/firestore';
import { Collections, isClassLesson, studentCountOf } from '@freedi/shared-types';
import type { Statement, StatementSubscription } from '@freedi/shared-types';
import { ADMIN_ROLES } from './classroomAccess';

/**
 * `statementSettings.studentCount` on a Class lesson (Trello sN881XCU).
 *
 * A student's phone may read only its own table's subscriptions, so it can no
 * longer count the class from the roster (the waiting screen's "N joined",
 * the turnout under the vote). The server counts instead, on every join and
 * leave of the lesson: every subscription that is not a teacher's (the same
 * people the old roster count kept, banned included).
 */

type SubscriptionData = Partial<Pick<StatementSubscription, 'statement' | 'role'>>;

/**
 * A subscription that belongs to a Class lesson, judged from the copy of the
 * lesson it carries (every Class writer, phone and server, stores one). No
 * read, so the trigger costs nothing for every other app's subscriptions; the
 * transaction below checks the lesson itself.
 */
export function isClassLessonSubscription(subscription: SubscriptionData | undefined): boolean {
	return isClassLesson(subscription?.statement);
}

/** A role change that moves someone into or out of the count. */
export function changesStudentCount(before: SubscriptionData, after: SubscriptionData): boolean {
	const wasStudent = typeof before.role === 'string' && !ADMIN_ROLES.has(before.role);
	const isStudent = typeof after.role === 'string' && !ADMIN_ROLES.has(after.role);

	return wasStudent !== isStudent && isClassLessonSubscription(after);
}

/**
 * Recounts the students of a lesson and stores the number on it when it moved.
 * One transaction (the lesson and the count read together), so two joins
 * recounting at once cannot leave the older, smaller number behind.
 * Returns the count, or null when the statement is missing or not a lesson.
 */
export async function updateClassStudentCount(
	firestore: Firestore,
	mainId: string,
): Promise<number | null> {
	const lessonRef = firestore.collection(Collections.statements).doc(mainId);
	const students = firestore
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', mainId)
		.where('role', 'not-in', [...ADMIN_ROLES])
		.count();

	return firestore.runTransaction(async (tx) => {
		const [lessonSnap, counted] = await Promise.all([tx.get(lessonRef), tx.get(students)]);
		if (!lessonSnap.exists) return null;
		const lesson = lessonSnap.data() as Statement;
		if (!isClassLesson(lesson)) return null;
		const count = counted.data().count;
		if (studentCountOf(lesson) !== count) {
			tx.update(lessonRef, { 'statementSettings.studentCount': count, lastUpdate: Date.now() });
		}

		return count;
	});
}
