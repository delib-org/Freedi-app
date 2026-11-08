import { Collections, bannedWordKey, cleanBannedWords } from '@freedi/shared-types';
import type { AgoraTeacherBannedWords } from '@freedi/shared-types';
import { db, doc, getDoc } from './firebase';
import { setBannedWords } from './callables';

/** The teacher's own list, or empty when they never made one. Their doc, their uid: the rules allow nobody else. */
export async function fetchBannedWords(teacherUid: string): Promise<string[]> {
	const snapshot = await getDoc(doc(db, Collections.agoraTeacherBannedWords, teacherUid));
	const stored = snapshot.data() as AgoraTeacherBannedWords | undefined;

	return Array.isArray(stored?.words) ? stored.words : [];
}

/** Replace the whole list; resolves with what the server kept (cleaned, deduplicated) */
export async function saveBannedWords(words: readonly string[]): Promise<string[]> {
	const response = await setBannedWords({ words: [...words] });

	return response.words;
}

/**
 * Words typed in the box → the entries to add. A comma, a Hebrew comma or a
 * line break separates several at once; entries already on the list (by the
 * matcher's own reading of them) are left out.
 */
export function entriesToAdd(draft: string, current: readonly string[]): string[] {
	const known = new Set(current.map(bannedWordKey));
	const added: string[] = [];
	for (const piece of draft.split(/[,،\n]+/)) {
		const [entry] = cleanBannedWords([piece]);
		if (!entry) continue;
		const key = bannedWordKey(entry);
		if (known.has(key)) continue;
		known.add(key);
		added.push(entry);
	}

	return added;
}
