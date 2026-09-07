import { db } from '../db';
import { Collections, AgoraTeacherPromptMap, AgoraTeacherPrompts } from '@freedi/shared-types';

/**
 * A teacher's standing wording for the rounds — the words they last said
 * "use this for all my rounds like this" about. Absent for every teacher who
 * has never reworded one, which is the common case, so callers must treat
 * `undefined` as "the book's own prompts".
 */
export async function loadTeacherPrompts(uid: string): Promise<AgoraTeacherPromptMap | undefined> {
	const snap = await db.collection(Collections.agoraTeacherPrompts).doc(uid).get();
	const doc = snap.data() as AgoraTeacherPrompts | undefined;

	return doc?.prompts as AgoraTeacherPromptMap | undefined;
}
