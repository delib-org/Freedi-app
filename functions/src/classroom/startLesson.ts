import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { Collections, getRandomUID, isHomeId } from '@freedi/shared-types';
import type { ClassGameSnapshot, ClassLessonLink, Statement, User } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { ClassroomError } from './classroomErrors';
import { asTopLevelLesson, buildLessonFromSnapshot, generateClassCode } from './cloneLesson';
import {
	readHomeAdmins,
	readSystemAdmins,
	revocableAdmins,
	resolveUsersFromAuth,
	revokeHomeAdminCopies,
	writeHome,
} from './classHome';
import type { HomeTarget, ResolveUsers } from './classHome';

/**
 * The one way a lesson is born (classStartLesson, classCloneLesson): ONE
 * transaction that ensures the home and re-syncs its admins, builds the lesson
 * and its questions and paragraphs from a snapshot under the home, and claims a
 * free class code. So there is never a lesson without a code or a home. A retry
 * with the same `newMainId` returns the lesson it made.
 *
 * `target: null` makes an OLD-STYLE top-level lesson (classCloneLesson while
 * CLONE_UNDER_HOME is false): no home, no admins, parentId 'top'.
 *
 * The creator's own subscription on the lesson is not written here:
 * `onStatementCreated` writes it, and copies the home's admins (the class's
 * teachers) onto the lesson and everything under it.
 */

/** Free-code attempts inside one transaction before giving up. */
export const CLASS_CODE_MAX_ATTEMPTS = 8;
export const CLASS_CODES_COLLECTION = 'classCodes';
/** Placeholder home while building a top-level lesson (remapped by asTopLevelLesson). */
const NO_HOME = 'top';

export interface StartLessonDeps {
	now?: () => number;
	random?: () => number;
	newId?: () => string;
	resolveUsers?: ResolveUsers;
}

export interface StartLessonInput {
	actor: User;
	/** The home; null = an old-style top-level lesson. */
	target: HomeTarget | null;
	newMainId: string;
	title: string;
	snapshot: ClassGameSnapshot;
	classLesson?: ClassLessonLink;
	sourceLesson?: { id: string; title: string };
	/** True when a lesson already at `newMainId` is this same request, retried. */
	isRetryOf: (found: Statement) => boolean;
	/**
	 * Re-derives the target inside the transaction (a class home: tx.get of the class),
	 * so the admin re-sync never works from a teacher list read before it. Must keep
	 * the same homeId.
	 */
	refreshTarget?: (tx: Transaction) => Promise<HomeTarget>;
}

export interface StartLessonResult {
	mainId: string;
	classCode: string;
	/** The home; '' for a top-level lesson. */
	homeId: string;
	reused: boolean;
}

async function adminUsers(actor: User, target: HomeTarget, resolve: ResolveUsers): Promise<User[]> {
	const others = target.adminUids.filter((uid) => uid !== actor.uid);
	const resolved = others.length > 0 ? await resolve(others) : [];

	return [actor, ...resolved];
}

/** Best effort, after the commit: a failure leaves copies the next start retries. */
async function revokeAll(
	firestore: Firestore,
	homeId: string,
	uids: readonly string[],
): Promise<void> {
	for (const uid of uids) {
		try {
			await revokeHomeAdminCopies(firestore, homeId, uid);
		} catch (error) {
			logError(error, {
				operation: 'classroom.startLesson.revokeHomeAdminCopies',
				userId: uid,
				statementId: homeId,
			});
		}
	}
}

export async function startLessonUnderHome(
	firestore: Firestore,
	input: StartLessonInput,
	deps: StartLessonDeps = {},
): Promise<StartLessonResult> {
	const now = deps.now ?? Date.now;
	const random = deps.random ?? Math.random;
	const newId = deps.newId ?? getRandomUID;
	const { target, newMainId } = input;
	// A client-chosen id must never take a home's id (it would squat that home).
	if (isHomeId(newMainId) || newMainId === target?.homeId) {
		throw new ClassroomError('invalid-argument', 'newMainId must be a new id');
	}
	const users = target
		? await adminUsers(input.actor, target, deps.resolveUsers ?? resolveUsersFromAuth)
		: [];
	const statements = firestore.collection(Collections.statements);
	const mainRef = statements.doc(newMainId);
	let revokedUids: string[] = [];

	const result = await firestore.runTransaction(async (tx): Promise<StartLessonResult> => {
		revokedUids = [];
		const existing = await tx.get(mainRef);
		if (existing.exists) {
			const found = existing.data() as Statement;
			if (input.isRetryOf(found)) {
				return {
					mainId: newMainId,
					classCode: found.statementSettings?.classCode ?? '',
					homeId: found.parentId === 'top' ? '' : found.parentId,
					reused: true,
				};
			}
			throw new ClassroomError('already-exists', 'That lesson id is taken');
		}

		const fresh = target && input.refreshTarget ? await input.refreshTarget(tx) : target;
		if (fresh && target && fresh.homeId !== target.homeId) {
			throw new ClassroomError('aborted', 'The class changed, try again');
		}
		const homeSnap = fresh ? await tx.get(statements.doc(fresh.homeId)) : undefined;
		const admins = fresh ? await readHomeAdmins(firestore, tx, fresh) : undefined;
		const systemAdmins =
			fresh && admins
				? await readSystemAdmins(firestore, tx, revocableAdmins(fresh, admins))
				: undefined;
		let classCode: string | null = null;
		for (let attempt = 0; attempt < CLASS_CODE_MAX_ATTEMPTS && !classCode; attempt++) {
			const candidate = generateClassCode(random);
			if (!(await tx.get(firestore.collection(CLASS_CODES_COLLECTION).doc(candidate))).exists) {
				classCode = candidate;
			}
		}
		if (!classCode) {
			throw new ClassroomError('resource-exhausted', 'No free class code, try again');
		}

		// Writes only from here on (a transaction reads everything first).
		const at = now();
		if (fresh && homeSnap && admins) {
			revokedUids = writeHome({
				firestore,
				tx,
				target: fresh,
				existing: homeSnap.exists ? (homeSnap.data() as Statement) : undefined,
				existingAdmins: admins,
				systemAdmins,
				creator: input.actor,
				users,
				now: at,
			}).revokedUids;
		}
		const built = buildLessonFromSnapshot({
			snapshot: input.snapshot,
			homeId: target?.homeId ?? NO_HOME,
			lessonId: newMainId,
			title: input.title,
			creator: input.actor,
			classCode,
			now: at,
			newId,
			classLesson: input.classLesson,
			sourceLesson: input.sourceLesson,
		});
		const lesson = target ? built : asTopLevelLesson(built);
		tx.create(mainRef, lesson.main);
		for (const child of [...lesson.questions, ...lesson.paragraphs]) {
			tx.create(statements.doc(child.statementId), child);
		}
		tx.create(firestore.collection(CLASS_CODES_COLLECTION).doc(classCode), {
			mainId: newMainId,
			createdAt: at,
		});

		return { mainId: newMainId, classCode, homeId: target?.homeId ?? '', reused: false };
	});
	if (target && revokedUids.length > 0) await revokeAll(firestore, target.homeId, revokedUids);

	return result;
}
