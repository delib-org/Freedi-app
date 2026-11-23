import type { DocumentReference, DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import {
	CLASS_SIDES_COLLECTION,
	CLASS_SIDE_LOCKS_COLLECTION,
	classSideId,
	mergeClassSide,
} from '@freedi/shared-types';
import type {
	ClassSide,
	ClassSideLock,
	ClassSideValues,
	StatementSubscription,
} from '@freedi/shared-types';

/**
 * The students' private sides (Trello btMVQMM5): `classSides/{uid}--{mainId}`,
 * readable only by the student and by this Admin SDK code. Until the backfill
 * has run, an app version from before the change may still hold the values on
 * the subscription; the private doc wins field by field (mergeClassSide).
 */

export function classSideRef(firestore: Firestore, mainId: string, uid: string): DocumentReference {
	return firestore.collection(CLASS_SIDES_COLLECTION).doc(classSideId(mainId, uid));
}

/** Reads several refs at once: `firestore.getAll` or a transaction's `getAll`. */
export type GetAll = (...refs: DocumentReference[]) => Promise<DocumentSnapshot[]>;

/** The side values of each subscriber, by uid: private doc over the legacy subscription fields. */
export async function sidesOf(
	firestore: Firestore,
	mainId: string,
	subs: readonly StatementSubscription[],
	getAll: GetAll = (...refs) => firestore.getAll(...refs),
): Promise<Map<string, ClassSideValues>> {
	const refs = subs.map((sub) => classSideRef(firestore, mainId, sub.userId));
	const snaps = refs.length > 0 ? await getAll(...refs) : [];

	return new Map(
		subs.map((sub, i) => [
			sub.userId,
			mergeClassSide(snaps[i]?.data() as ClassSide | undefined, sub),
		]),
	);
}

/**
 * Freeze the lesson's sides for good (decision C): creates classSideLocks/{mainId}
 * once; an existing lock keeps its first time. No client can change or delete it.
 */
export async function lockSides(
	firestore: Firestore,
	mainId: string,
	now: number = Date.now(),
): Promise<void> {
	const ref = firestore.collection(CLASS_SIDE_LOCKS_COLLECTION).doc(mainId);
	const snap = await ref.get();
	if (snap.exists) return;
	const lock: ClassSideLock = { mainId, lockedAt: now };
	await ref.set(lock);
}
