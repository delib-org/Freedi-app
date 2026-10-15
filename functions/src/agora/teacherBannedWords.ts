import { db } from '../db';
import { Collections, AgoraTeacherBannedWords } from '@freedi/shared-types';

/**
 * A teacher's list of words their students may not use. Absent for every
 * teacher who never made one — the common case — so it reads as empty.
 */
export async function loadTeacherBannedWords(teacherId: string | undefined): Promise<string[]> {
	if (!teacherId) return [];
	const snap = await db.collection(Collections.agoraTeacherBannedWords).doc(teacherId).get();
	const doc = snap.data() as AgoraTeacherBannedWords | undefined;

	return Array.isArray(doc?.words) ? doc.words : [];
}
