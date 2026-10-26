import { FieldValue } from 'firebase-admin/firestore';
import type { ClassTable } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';

/**
 * Pure logic behind `classResetTurns` (IA 18.4): which tables, and the patch
 * that gives a table's turns back. Members, no-device members and every
 * Statement or rating stay.
 */

/** The tables to reset: all of them without `n`, else the one numbered `n`. */
export function selectTablesToReset(tables: readonly ClassTable[], n?: number): ClassTable[] {
	if (n === undefined) return [...tables];
	if (typeof n !== 'number' || !Number.isInteger(n)) {
		throw new ClassroomError('invalid-argument', 'n must be a table number');
	}
	const table = tables.find((tb) => tb.n === n);
	if (!table) throw new ClassroomError('not-found', `There is no table ${n}`);

	return [table];
}

/** The write that restarts one table's turns. */
export function turnResetPatch(now: number): Record<string, unknown> {
	return {
		step: 'pick',
		turn: 1,
		askerUid: null,
		askedUids: [],
		passedAskingUids: [],
		usedQuestionIds: [],
		spokenUids: [],
		writingMode: 'each',
		writingLocked: false,
		updatedAt: now,
		questionId: FieldValue.delete(),
		speakerUid: FieldValue.delete(),
		speakerEndsAt: FieldValue.delete(),
		speakerMs: FieldValue.delete(),
		passedSpeakingUids: FieldValue.delete(),
	};
}
