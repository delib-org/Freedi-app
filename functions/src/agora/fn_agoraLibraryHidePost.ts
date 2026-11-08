import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AgoraScenarioPost,
	AgoraTopicPackage,
	Collections,
	LibraryHidePostRequest,
	LibraryHidePostResponse,
	canUnhidePost,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';
import { setPostHidden } from './libraryModeration';

const REASON_MAX = 200;

/**
 * Hide a discussion post, or lift the hide. The author of the scenario may
 * hide anything in their own thread; a system admin may hide anything in any
 * thread. A hide made by an admin is lifted only by an admin; the author lifts
 * only their own. Hidden is reversible and leaves the text in place.
 */
export const agoraLibraryHidePost = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<LibraryHidePostRequest>): Promise<LibraryHidePostResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		const { postId, action, reason } = request.data ?? ({} as LibraryHidePostRequest);
		if (!postId || typeof postId !== 'string') {
			throw new HttpsError('invalid-argument', 'postId is required');
		}
		if (action !== 'hide' && action !== 'unhide') {
			throw new HttpsError('invalid-argument', 'action must be hide or unhide');
		}
		const why = typeof reason === 'string' ? reason.trim().slice(0, REASON_MAX) : '';

		try {
			const isAdmin = await isSystemAdmin(uid);
			const postSnap = await db.collection(Collections.agoraScenarioPosts).doc(postId).get();
			const post = postSnap.data() as AgoraScenarioPost | undefined;
			if (!post) throw new HttpsError('not-found', 'Post not found');
			const pkgSnap = await db
				.collection(Collections.agoraTopicPackages)
				.doc(post.scenarioId)
				.get();
			const pkg = pkgSnap.data() as AgoraTopicPackage | undefined;
			const isOwner = pkg?.creatorId === uid;
			if (!isAdmin && !isOwner) {
				throw new HttpsError(
					'permission-denied',
					'Only the scenario author or a system admin can hide a post',
				);
			}
			if (action === 'unhide' && !canUnhidePost(post, { isAdmin, isOwner })) {
				throw new HttpsError('permission-denied', 'Only a system admin can lift this hide');
			}

			await setPostHidden({
				postId,
				hide: action === 'hide',
				by: isAdmin ? 'admin' : 'owner',
				reason: why,
			});

			return { postId, hidden: action === 'hide' };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, { operation: 'agora.libraryHidePost', userId: uid, metadata: { postId } });
			throw new HttpsError('internal', 'Failed to change the post');
		}
	},
);
