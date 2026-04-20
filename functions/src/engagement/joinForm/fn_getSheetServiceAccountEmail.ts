import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { functionConfig } from '@freedi/shared-types';

interface Result {
	email: string;
}

/**
 * Returns the Google Sheets service account email to display in the admin
 * question settings so admins know whom to share their sheet with. Requires
 * authentication (no need for admin-only here — the email is already public
 * once an admin enables the feature, and returning empty string leaks nothing).
 *
 * Env read is inlined rather than imported from `getGoogleSheetsClient.ts`
 * on purpose: importing that module pulls in `googleapis` (~100MB), which
 * OOMs the container at cold-start on 128MiB before it can listen on the
 * health-check port. This callable only needs the env var — keep the
 * import graph tiny so the cold-start stays well within budget.
 */
export const getSheetServiceAccountEmail = onCall(
	{ memory: '256MiB', region: functionConfig.region },
	async (request: CallableRequest<unknown>): Promise<Result> => {
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		return { email: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL ?? '' };
	},
);
