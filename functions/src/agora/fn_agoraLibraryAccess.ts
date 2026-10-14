import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { functionConfig, LibraryAccessResponse } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { ensureSeedTags, resolveApproval, syncApprovalMarker } from './libraryAccess';

/**
 * The door to the scenario library. A teacher's browser calls it on opening
 * the library: it answers whether this account is an approved teacher (see
 * `libraryAccess.ts` for what that means today), brings the rules-visible
 * marker in line with the answer, and makes sure the starting vocabulary
 * exists. Everything else in the library asks the marker (rules) or the live
 * answer (callables) — this is where the marker is kept fresh.
 */
export const agoraLibraryAccess = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<unknown>): Promise<LibraryAccessResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			return { approved: false, isAdmin: false };
		}

		try {
			const approval = await resolveApproval(uid);
			await syncApprovalMarker(uid, approval);
			if (approval.approved) await ensureSeedTags();

			return { approved: approval.approved, isAdmin: approval.isAdmin, via: approval.via };
		} catch (error) {
			logError(error, { operation: 'agora.libraryAccess', userId: uid });
			throw new HttpsError('internal', 'Failed to check library access');
		}
	},
);
