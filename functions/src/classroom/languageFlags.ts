import type { Firestore } from 'firebase-admin/firestore';
import {
	CLASS_LANGUAGE_FLAGS_COLLECTION,
	CLASS_LANGUAGE_FLAGS_KEPT,
	CLASS_LANGUAGE_FLAG_TTL_DAYS,
	getRandomUID,
} from '@freedi/shared-types';
import type { ClassLanguageFlag, ClassLanguageFlagKind } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

/**
 * The teacher's flag of a refused attempt (IA 24.4): one document in
 * `classLanguageFlags` per refused proposal / edit / reply. Server-written only.
 * The attempted text is a child's words: it is stored here for the teacher and
 * NEVER put in a log, an error context or a push.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface LanguageFlagInput {
	mainId: string;
	uid: string;
	kind: ClassLanguageFlagKind;
	/** The proposal replied to, or the proposal being edited. */
	targetId?: string;
	text: string;
	/** The item's maximum length: the stored text is cut to it. */
	maxLength: number;
	now: number;
}

type StoredFlag = Pick<ClassLanguageFlag, 'flagId' | 'attempt' | 'createdAt'>;

export interface FlagPlan {
	/** Which refused attempt of this student in this lesson the new flag is. */
	attempt: number;
	/** Flags to delete so the student keeps at most CLASS_LANGUAGE_FLAGS_KEPT, new one included. */
	deleteIds: string[];
}

/**
 * Pure: the new flag's attempt number, and the oldest flags to trim so only the
 * last `keep` texts (the new one included) stay.
 */
export function planFlagWrite(
	existing: readonly StoredFlag[],
	keep: number = CLASS_LANGUAGE_FLAGS_KEPT,
): FlagPlan {
	const newestFirst = [...existing].sort((a, b) => b.createdAt - a.createdAt);
	const highest = existing.reduce((top, f) => Math.max(top, f.attempt ?? 0), 0);

	return {
		attempt: Math.max(highest, existing.length) + 1,
		deleteIds: newestFirst.slice(Math.max(0, keep - 1)).map((f) => f.flagId),
	};
}

/** The flag document for one refused attempt. */
export function buildLanguageFlag(
	input: LanguageFlagInput,
	flagId: string,
	attempt: number,
): ClassLanguageFlag {
	return {
		flagId,
		mainId: input.mainId,
		uid: input.uid,
		kind: input.kind,
		...(input.targetId ? { targetId: input.targetId } : {}),
		text: input.text.slice(0, input.maxLength),
		attempt,
		createdAt: input.now,
		expireAt: input.now + CLASS_LANGUAGE_FLAG_TTL_DAYS * MS_PER_DAY,
	};
}

/**
 * Write the flag and trim the student's older ones. Never throws: a failed
 * flag must not turn a refusal into an error (the student is still asked to
 * rewrite), so the failure is logged without the text.
 */
export async function writeLanguageFlag(
	firestore: Firestore,
	input: LanguageFlagInput,
): Promise<void> {
	try {
		const collection = firestore.collection(CLASS_LANGUAGE_FLAGS_COLLECTION);
		const found = await collection
			.where('mainId', '==', input.mainId)
			.where('uid', '==', input.uid)
			.get();
		const plan = planFlagWrite(found.docs.map((d) => d.data() as StoredFlag));
		const flagId = getRandomUID();
		const batch = firestore.batch();
		batch.set(collection.doc(flagId), buildLanguageFlag(input, flagId, plan.attempt));
		plan.deleteIds.forEach((id) => batch.delete(collection.doc(id)));
		await batch.commit();
	} catch (error) {
		logError(error, {
			operation: 'classroom.writeLanguageFlag',
			userId: input.uid,
			statementId: input.targetId,
			metadata: { mainId: input.mainId, kind: input.kind },
		});
	}
}
