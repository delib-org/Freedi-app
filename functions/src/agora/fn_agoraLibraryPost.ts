import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AGORA_LIBRARY_COMMUNITY,
	AgoraApprovedTeacher,
	AgoraLibraryStats,
	AgoraScenarioPost,
	AgoraTopicPackage,
	Collections,
	LibraryPostRequest,
	LibraryPostResponse,
	emptyLibraryStats,
	functionConfig,
	getRandomUID,
} from '@freedi/shared-types';
import { containsBadLanguage } from '../fn_profanityChecker';
import { logError } from '../utils/errorHandling';
import { authorNameOf, countPost, markerRef, requireApprovedTeacher } from './libraryAccess';
import { currentGlobalMean } from './libraryStats';

/**
 * Write a post under a library scenario, or a reply to one. Any approved
 * teacher may (asking before using a scenario is the point), the scenario's
 * own author too. Replies sit one level under a top-level post of the same
 * scenario. The words pass the same language check as a review; a day's
 * allowance of posts keeps a thread from being flooded. `stats.postCount`
 * moves in the same transaction as the post.
 */
export const agoraLibraryPost = onCall(
	{ region: functionConfig.region, timeoutSeconds: 60 },
	async (request: CallableRequest<LibraryPostRequest>): Promise<LibraryPostResponse> => {
		const { uid } = await requireApprovedTeacher(request);
		const { scenarioId, text, parentId } = request.data ?? ({} as LibraryPostRequest);
		if (!scenarioId || typeof scenarioId !== 'string') {
			throw new HttpsError('invalid-argument', 'scenarioId is required');
		}
		if (typeof text !== 'string') {
			throw new HttpsError('invalid-argument', 'text is required');
		}
		if (parentId !== undefined && (typeof parentId !== 'string' || !parentId)) {
			throw new HttpsError('invalid-argument', 'parentId must be a post id');
		}
		const body = text.trim();
		if (!body || body.length > AGORA_LIBRARY_COMMUNITY.POST_MAX) {
			throw new HttpsError(
				'invalid-argument',
				`A post must have 1-${AGORA_LIBRARY_COMMUNITY.POST_MAX} characters`,
			);
		}
		if (await containsBadLanguage(body)) {
			throw new HttpsError('invalid-argument', 'That post is not allowed');
		}

		try {
			const authorName = await authorNameOf(uid);
			const globalMean = await currentGlobalMean();
			const packageRef = db.collection(Collections.agoraTopicPackages).doc(scenarioId);
			const postRef = db.collection(Collections.agoraScenarioPosts).doc(getRandomUID());
			const now = Date.now();

			await db.runTransaction(async (transaction) => {
				const [pkgSnap, markerSnap, parentSnap] = await Promise.all([
					transaction.get(packageRef),
					transaction.get(markerRef(uid)),
					parentId
						? transaction.get(db.collection(Collections.agoraScenarioPosts).doc(parentId))
						: Promise.resolve(null),
				]);
				const pkg = pkgSnap.data() as AgoraTopicPackage | undefined;
				if (!pkg || pkg.visibility !== 'public' || !pkg.library || pkg.library.hidden) {
					throw new HttpsError('not-found', 'Scenario not found');
				}
				if (parentId) {
					const parent = parentSnap?.data() as AgoraScenarioPost | undefined;
					if (!parent || parent.scenarioId !== scenarioId || parent.hidden) {
						throw new HttpsError('not-found', 'The post you are replying to is gone');
					}
					if (parent.parentId) {
						throw new HttpsError('invalid-argument', 'Reply to the post itself, not to a reply');
					}
				}
				const counted = countPost(
					markerSnap.data() as Partial<AgoraApprovedTeacher> | undefined,
					now,
				);
				if (!counted) throw new HttpsError('resource-exhausted', 'Post limit reached for today');

				const post: AgoraScenarioPost = {
					postId: postRef.id,
					scenarioId,
					scenarioOwnerId: pkg.creatorId,
					authorId: uid,
					authorName,
					text: body,
					...(parentId ? { parentId } : {}),
					hidden: false,
					createdAt: now,
					lastUpdate: now,
				};
				const stats: AgoraLibraryStats = pkg.stats ?? emptyLibraryStats(globalMean);
				transaction.set(postRef, post);
				transaction.set(markerRef(uid), counted, { merge: true });
				transaction.update(packageRef, {
					stats: { ...stats, postCount: (stats.postCount ?? 0) + 1 },
				});
			});

			return { postId: postRef.id };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, { operation: 'agora.libraryPost', userId: uid, metadata: { scenarioId } });
			throw new HttpsError('internal', 'Failed to save the post');
		}
	},
);
