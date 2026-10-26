import type { Firestore } from 'firebase-admin/firestore';
import { Role } from '@freedi/shared-types';
import type { Creator, Statement, StatementSubscription } from '@freedi/shared-types';
import { isWorkspaceAdmin, subscriptionRef } from './classroomAccess';
import { ClassroomError } from './classroomErrors';

/**
 * Who is calling a classroom callable that students and the teacher share
 * (replies, proposals): a member of the lesson, or its teacher.
 */

/** The writer as a statement's creator: the class name for a student, the account name for the teacher. */
export function creatorOf(
	uid: string,
	sub: StatementSubscription | undefined,
	main: Statement,
): Creator {
	const fromSub = sub?.user;
	const teacher = main.creatorId === uid ? main.creator : undefined;

	return {
		uid,
		displayName: fromSub?.displayName?.trim() || teacher?.displayName || '',
		photoURL: null,
		isAnonymous: fromSub?.isAnonymous ?? teacher?.isAnonymous ?? true,
	};
}

/** The caller's role in the lesson; refuses someone who never joined (or was banned). */
export async function loadMembership(
	firestore: Firestore,
	mainId: string,
	uid: string,
	main: Statement,
): Promise<{ teacher: boolean; sub: StatementSubscription | undefined }> {
	const snap = await subscriptionRef(firestore, mainId, uid).get();
	const sub = snap.exists ? (snap.data() as StatementSubscription) : undefined;
	const teacher = await isWorkspaceAdmin(firestore, mainId, uid, main);
	if (!teacher && (!sub || sub.role === Role.banned)) {
		throw new ClassroomError('permission-denied', 'Join the lesson first');
	}

	return { teacher, sub };
}
