import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { functionConfig } from '@freedi/shared-types';
import type { MintAgoraHandoffResponse as Result } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

/**
 * Hand a player from Odyssey to Agora without asking them to sign in twice.
 *
 * The two games are served from different origins, so Firebase auth does not
 * carry across — a player walking through an island's gate would arrive as a
 * brand-new anonymous stranger, and the stances they just spent a voyage
 * taking could not be read back to place them in a camp. This mints a custom
 * token for the CALLER'S OWN uid so they arrive in Agora as themselves.
 *
 * It grants nothing the holder does not already have: the only uid it will
 * ever sign is the one that made the call. The token is short-lived (Firebase
 * fixes custom tokens at an hour) and the gate consumes it immediately,
 * replacing the URL before the address bar ever settles on it.
 */
export const odysseyMintAgoraHandoff = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<unknown>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		try {
			const token = await getAuth().createCustomToken(uid);

			return { token, uid };
		} catch (error) {
			logError(error, {
				operation: 'odyssey.mintAgoraHandoff',
				userId: uid,
			});
			throw new HttpsError('internal', 'Failed to mint handoff token');
		}
	},
);
