import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
	LibraryModerateRequest,
	LibraryModerateResponse,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';
import { setPostHidden, setReviewHidden, setScenarioHidden } from './libraryModeration';

const REASON_MAX = 200;

/**
 * Hide a scenario, a review or a discussion post, or lift the hide: a
 * sys-admin's tool. Hidden is reversible and leaves everything in place.
 *
 *  - A hidden scenario drops out of the library list and off its tags' counts;
 *    copies already taken are untouched, and its owner is told it was hidden.
 *  - A hidden review stops being shown AND stops counting in the scenario's
 *    stars; lifting the hide puts it back in.
 *  - A hidden post leaves the thread (and the scenario's post count).
 *
 * The reports queue (`agoraLibraryReport` / `agoraLibraryResolveReport`) and
 * this callable share the same writers in `libraryModeration.ts`.
 */
export const agoraLibraryModerate = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<LibraryModerateRequest>): Promise<LibraryModerateResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (!(await isSystemAdmin(uid))) {
			throw new HttpsError('permission-denied', 'Only a system admin can hide library content');
		}
		const { action, targetKind, targetId, reason } = request.data ?? ({} as LibraryModerateRequest);
		if (action !== 'hide' && action !== 'unhide') {
			throw new HttpsError('invalid-argument', 'action must be hide or unhide');
		}
		if (targetKind !== 'scenario' && targetKind !== 'review' && targetKind !== 'post') {
			throw new HttpsError('invalid-argument', 'targetKind must be scenario, review or post');
		}
		if (!targetId || typeof targetId !== 'string') {
			throw new HttpsError('invalid-argument', 'targetId is required');
		}
		const hide = action === 'hide';
		const why = typeof reason === 'string' ? reason.trim().slice(0, REASON_MAX) : '';

		try {
			if (targetKind === 'scenario') {
				await setScenarioHidden({ scenarioId: targetId, hide, reason: why });
			} else if (targetKind === 'review') {
				await setReviewHidden({ ratingId: targetId, hide, reason: why });
			} else {
				await setPostHidden({ postId: targetId, hide, by: 'admin', reason: why });
			}

			return { targetId, hidden: hide };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.libraryModerate',
				userId: uid,
				metadata: { action, targetKind, targetId },
			});
			throw new HttpsError('internal', 'Failed to moderate');
		}
	},
);
