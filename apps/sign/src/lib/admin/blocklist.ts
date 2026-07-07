/**
 * Per-document blocklist for the Sign app.
 *
 * A blocked (banned) user is prevented from signing, commenting, suggesting,
 * evaluating or approving on a document. Blocking is reversible — unban removes
 * the record. Stored at signBlocklist/{documentId}/users/{userId}.
 */

import { Firestore } from 'firebase-admin/firestore';
import { logger } from '@/lib/utils/logger';

export const BLOCKLIST_COLLECTION = 'signBlocklist';
const USERS_SUBCOLLECTION = 'users';

export interface BlockedUser {
	userId: string;
	displayName?: string;
	blockedBy: string;
	blockedAt: number;
}

function blockedUsersRef(db: Firestore, documentId: string) {
	return db.collection(BLOCKLIST_COLLECTION).doc(documentId).collection(USERS_SUBCOLLECTION);
}

/** Block a user from contributing to a document. */
export async function banUser(
	db: Firestore,
	documentId: string,
	targetUserId: string,
	blockedBy: string,
	displayName: string | undefined,
	blockedAt: number
): Promise<void> {
	const record: BlockedUser = {
		userId: targetUserId,
		blockedBy,
		blockedAt,
		...(displayName ? { displayName } : {}),
	};
	await blockedUsersRef(db, documentId).doc(targetUserId).set(record);
	logger.info(`[Blocklist] Banned ${targetUserId} on ${documentId} by ${blockedBy}`);
}

/** Remove a user's block. */
export async function unbanUser(
	db: Firestore,
	documentId: string,
	targetUserId: string
): Promise<void> {
	await blockedUsersRef(db, documentId).doc(targetUserId).delete();
	logger.info(`[Blocklist] Unbanned ${targetUserId} on ${documentId}`);
}

/**
 * Check whether a user is blocked on a document. Fails open (returns false) on
 * error so a transient blocklist read never blocks a legitimate contribution.
 */
export async function isUserBlocked(
	db: Firestore,
	documentId: string,
	userId: string
): Promise<boolean> {
	if (!userId) return false;
	try {
		const snap = await blockedUsersRef(db, documentId).doc(userId).get();

		return snap.exists;
	} catch (error) {
		logger.error('[Blocklist] isUserBlocked check failed:', error);

		return false;
	}
}

/** List all blocked users on a document, newest first. */
export async function listBlockedUsers(
	db: Firestore,
	documentId: string
): Promise<BlockedUser[]> {
	const snap = await blockedUsersRef(db, documentId).get();

	return snap.docs
		.map((d) => d.data() as BlockedUser)
		.sort((a, b) => b.blockedAt - a.blockedAt);
}
