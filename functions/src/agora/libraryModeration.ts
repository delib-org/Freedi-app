import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AgoraPostHiddenBy,
	AgoraScenarioPost,
	AgoraTopicPackage,
	Collections,
	emptyLibraryStats,
} from '@freedi/shared-types';
import { currentGlobalMean } from './libraryStats';

/**
 * The moderation writes the callables share, each one transaction so a hide
 * and the counter it moves cannot come apart.
 */

export interface PostHide {
	postId: string;
	hide: boolean;
	by: AgoraPostHiddenBy;
	reason: string;
}

/** Hide or show one post; the scenario's visible-post count follows. Idempotent. */
export async function setPostHidden(change: PostHide): Promise<void> {
	const globalMean = await currentGlobalMean();
	const postRef = db.collection(Collections.agoraScenarioPosts).doc(change.postId);
	await db.runTransaction(async (transaction) => {
		const postSnap = await transaction.get(postRef);
		const post = postSnap.data() as AgoraScenarioPost | undefined;
		if (!post) throw new HttpsError('not-found', 'Post not found');
		const packageRef = db.collection(Collections.agoraTopicPackages).doc(post.scenarioId);
		const pkg = (await transaction.get(packageRef)).data() as AgoraTopicPackage | undefined;
		if (post.hidden === change.hide) return;

		transaction.update(postRef, {
			hidden: change.hide,
			lastUpdate: Date.now(),
			hiddenBy: change.hide ? change.by : FieldValue.delete(),
			hiddenReason: change.hide && change.reason ? change.reason : FieldValue.delete(),
		});
		if (pkg) {
			const stats = pkg.stats ?? emptyLibraryStats(globalMean);
			transaction.update(packageRef, {
				stats: {
					...stats,
					postCount: Math.max(0, (stats.postCount ?? 0) + (change.hide ? -1 : 1)),
				},
			});
		}
	});
}
