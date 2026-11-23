import { CLASS_SIDE_LOCKED_STEPS, CLASS_SIDE_LOCKS_COLLECTION } from '@freedi/shared-types';
import type { ClassSideLock } from '@freedi/shared-types';
import { db, doc, getDoc, setDoc } from '../firebase';
import { captureException } from '../sentry';

/**
 * Decision C (Trello btMVQMM5): once a lesson has reached Vote / Summary, its
 * sides are frozen for good, even back at the Side step. The lock is
 * `classSideLocks/{mainId}`; no client can change or delete it. The server
 * (classSupportBySide) writes it before the first total leaves, which is what
 * makes it unskippable; the teacher's move to Vote / Summary writes it too, so
 * a lesson that reached Vote is locked even when nobody looked at the totals.
 */

export function sideLockRef(mainId: string) {
	return doc(db, CLASS_SIDE_LOCKS_COLLECTION, mainId);
}

/** After the teacher moved the lesson to `stepKey`: lock the sides when it is Vote / Summary. Never throws. */
export async function lockSidesAfterMove(mainId: string, stepKey: string): Promise<void> {
	if (!CLASS_SIDE_LOCKED_STEPS.includes(stepKey)) return;
	try {
		const ref = sideLockRef(mainId);
		if ((await getDoc(ref)).exists()) return;
		const lock: ClassSideLock = { mainId, lockedAt: Date.now() };
		await setDoc(ref, lock);
	} catch (error) {
		// The server still locks before its first total; a lost race (already locked) lands here too.
		captureException(error, { operation: 'classroom.lockSidesAfterMove', mainId, stepKey });
	}
}

/** Is this lesson locked? (a pick checks it right before writing) */
export async function isSideLocked(mainId: string): Promise<boolean> {
	const snap = await getDoc(sideLockRef(mainId));

	return snap.exists();
}
