import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { functionConfig } from '@freedi/shared-types';
import { getSheetServiceAccountEmail as readEmail } from './getGoogleSheetsClient';

interface Result {
	email: string;
}

/**
 * Returns the Google Sheets service account email to display in the admin
 * question settings so admins know whom to share their sheet with. Requires
 * authentication (no need for admin-only here — the email is already public
 * once an admin enables the feature, and returning empty string leaks nothing).
 */
export const getSheetServiceAccountEmail = onCall(
	{ memory: '128MiB', region: functionConfig.region },
	async (request: CallableRequest<unknown>): Promise<Result> => {
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		return { email: readEmail() };
	},
);
