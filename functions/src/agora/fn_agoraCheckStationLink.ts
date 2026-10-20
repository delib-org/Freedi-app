import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
	functionConfig,
	type CheckStationLinkRequest,
	type CheckStationLinkResponse,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { requireApprovedTeacher } from './libraryAccess';
import { checkStationLink } from './stationLink';

/**
 * The step editor checks a pasted link as the teacher leaves the field:
 * a WizCol question the teacher administers comes back with its words, any
 * other link with the editor's own error key in `details.reason`.
 */
export const agoraCheckStationLink = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<CheckStationLinkRequest>): Promise<CheckStationLinkResponse> => {
		const { uid } = await requireApprovedTeacher(request);
		try {
			return await checkStationLink(request.data?.url, uid);
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, { operation: 'agora.checkStationLink', userId: uid });
			throw new HttpsError('internal', 'Could not check the link');
		}
	},
);
