import type { DocumentReference } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	AgoraTopicPackage,
	AgoraTopicReader,
	Collections,
	canOpenScenario,
	createAgoraTopicReaderId,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';

/**
 * The reader markers that let a player open the private scenario behind
 * their game (the rules ask `exists()` of one; see agoraScenarioAccess.ts in
 * shared-types). Written by the server only.
 */

export function topicReaderRef(topicPackageId: string, uid: string): DocumentReference {
	return db
		.collection(Collections.agoraTopicReaders)
		.doc(createAgoraTopicReaderId(topicPackageId, uid));
}

/**
 * Whether `uid` may open (and so run a lesson on) this scenario on its own
 * standing: public, their own, or they are a system admin. Reader markers are
 * not consulted — they let a player read the game they are in, not start one.
 */
export async function mayOpenScenario(
	pkg: Pick<AgoraTopicPackage, 'visibility' | 'creatorId'>,
	uid: string,
): Promise<boolean> {
	if (canOpenScenario(pkg, { uid, isSystemAdmin: false })) return true;

	return isSystemAdmin(uid);
}

/** The marker as it is stored */
export function buildTopicReader(
	topicPackageId: string,
	uid: string,
	sessionId: string,
	now: number,
): AgoraTopicReader {
	return { topicPackageId, uid, sessionId, grantedAt: now };
}

/**
 * Leave a marker for `uid` on the scenario `sessionId` plays. Idempotent: an
 * existing marker is left as it is, so the first session that granted it
 * stays recorded. Never throws: a missing marker costs the player one fallback
 * call (agoraTopicAccess), never their seat.
 */
export async function grantTopicRead(
	topicPackageId: string,
	uid: string,
	sessionId: string,
): Promise<boolean> {
	try {
		const ref = topicReaderRef(topicPackageId, uid);
		const existing = await ref.get();
		if (!existing.exists) {
			await ref.set(buildTopicReader(topicPackageId, uid, sessionId, Date.now()));
		}

		return true;
	} catch (error) {
		logError(error, {
			operation: 'agora.grantTopicRead',
			userId: uid,
			metadata: { topicPackageId, sessionId },
		});

		return false;
	}
}
