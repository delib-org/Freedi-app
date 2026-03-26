import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import { Collections } from '@freedi/shared-types';
import { store } from '@/redux/store';
import { setBookmarks } from '@/redux/statements/statementsSlice';
import { logError } from '@/utils/errorHandling';
import { getCurrentTimestamp } from '@/utils/firebaseUtils';

/** Firestore document ID for a room's bookmarks */
function bookmarkDocId(userId: string, topParentId: string): string {
	return `bookmarks--${userId}--${topParentId}`;
}

/**
 * Persist a single bookmark toggle to Firestore.
 * Reads the current bookmark doc, merges the change, writes back.
 */
export async function persistBookmarkToggle(
	statementId: string,
	isBookmarked: boolean,
	userId: string,
	topParentId: string,
): Promise<void> {
	try {
		if (!userId || !topParentId) return;

		const docId = bookmarkDocId(userId, topParentId);
		const docRef = doc(FireStore, Collections.usersData, docId);

		const snapshot = await getDoc(docRef);
		const existing = snapshot.exists()
			? ((snapshot.data().bookmarks as Record<string, true>) ?? {})
			: {};

		if (isBookmarked) {
			existing[statementId] = true;
		} else {
			delete existing[statementId];
		}

		await setDoc(docRef, {
			userId,
			topParentId,
			bookmarks: existing,
			lastUpdate: getCurrentTimestamp(),
		});
	} catch (error) {
		logError(error, {
			operation: 'bookmarks.persistBookmarkToggle',
			userId,
			statementId,
			metadata: { topParentId },
		});
	}
}

/**
 * Load all bookmarks for a room from Firestore and hydrate Redux.
 * Called once when entering a room.
 */
export async function loadBookmarksForRoom(userId: string, topParentId: string): Promise<void> {
	try {
		if (!userId || !topParentId) return;

		const docId = bookmarkDocId(userId, topParentId);
		const docRef = doc(FireStore, Collections.usersData, docId);
		const snapshot = await getDoc(docRef);

		if (!snapshot.exists()) return;

		const data = snapshot.data();
		const bookmarks = data.bookmarks as Record<string, true> | undefined;
		if (!bookmarks || typeof bookmarks !== 'object') return;

		const bookmarkEntries: Record<string, boolean> = {};
		for (const childStatementId of Object.keys(bookmarks)) {
			bookmarkEntries[childStatementId] = true;
		}

		if (Object.keys(bookmarkEntries).length > 0) {
			store.dispatch(setBookmarks(bookmarkEntries));
		}
	} catch (error) {
		logError(error, {
			operation: 'bookmarks.loadBookmarksForRoom',
			userId,
			metadata: { topParentId },
		});
	}
}
