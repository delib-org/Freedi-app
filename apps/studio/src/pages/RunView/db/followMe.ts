import { doc, setDoc } from 'firebase/firestore';
import { Collections } from '@freedi/shared-types';
import { db } from '@/firebase';
import { logError } from '@/utils/logError';

/**
 * "Follow me" for a live session — the same contract Join's FacilitatorPanel
 * uses (`pressFollowMe` → `setPowerFollowMe` in apps/join/src/lib/store.ts):
 * the TOP statement's `joinFollowMe` field holds a main-app style path
 * `/statement/{activityId}` while the facilitator is leading, and '' when
 * participants may browse freely. Join maps the path back onto its own
 * `/m/:topId/q/:activityId` route (`mapMainAppPathToJoinTarget`).
 *
 * NOT `powerFollowMe`: that field belongs to main-app sessions and is kept
 * separate so the two never fight over participants.
 */
export function followMePathFor(activityId: string): string {
	return `/statement/${activityId}`;
}

export function isFollowingActivity(joinFollowMe: string | undefined, activityId: string): boolean {
	return joinFollowMe === followMePathFor(activityId);
}

export async function setJoinFollowMe(topId: string, path: string): Promise<void> {
	try {
		await setDoc(
			doc(db, Collections.statements, topId),
			{ joinFollowMe: path, lastUpdate: Date.now() },
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'followMe.setJoinFollowMe',
			statementId: topId,
			metadata: { path },
		});
		throw error;
	}
}
