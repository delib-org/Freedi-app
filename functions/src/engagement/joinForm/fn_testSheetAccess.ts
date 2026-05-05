import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { functionConfig } from '@freedi/shared-types';
import { extractSheetId, getGoogleSheetsClient, getSheetServiceAccountEmail } from './getGoogleSheetsClient';

interface TestSheetAccessRequest {
	sheetUrl: string;
}

interface TestSheetAccessResult {
	ok: boolean;
	serviceAccountEmail: string;
	error?: string;
}

/**
 * Verifies that the Google Sheets service account has read/write access to
 * the given spreadsheet URL. Called from the facilitator panel "Test
 * connection" button so admins get immediate feedback before submitting
 * real form data and wondering why nothing appears in the sheet.
 *
 * Returns { ok: true } when the metadata fetch succeeds, or
 * { ok: false, error: "..." } with a human-readable explanation.
 *
 * Always also returns `serviceAccountEmail` so the UI can show the "share
 * your sheet with this address" hint even when the test fails.
 */
export const testSheetAccess = onCall(
	{ memory: '256MiB', region: functionConfig.region },
	async (request: CallableRequest<TestSheetAccessRequest>): Promise<TestSheetAccessResult> => {
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const serviceAccountEmail = getSheetServiceAccountEmail();
		const { sheetUrl } = request.data;

		if (!sheetUrl || typeof sheetUrl !== 'string') {
			return { ok: false, serviceAccountEmail, error: 'No sheet URL provided' };
		}

		const sheetId = extractSheetId(sheetUrl);
		if (!sheetId) {
			return { ok: false, serviceAccountEmail, error: 'Malformed Google Sheets URL' };
		}

		const sheets = getGoogleSheetsClient();
		if (!sheets) {
			return {
				ok: false,
				serviceAccountEmail,
				error: 'Google Sheets service account credentials are not configured on the server',
			};
		}

		try {
			await sheets.spreadsheets.get({ spreadsheetId: sheetId });

			return { ok: true, serviceAccountEmail };
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// 403 means the service account does not have access to the sheet.
			const is403 =
				msg.includes('403') ||
				msg.toLowerCase().includes('permission') ||
				msg.toLowerCase().includes('forbidden');

			return {
				ok: false,
				serviceAccountEmail,
				error: is403
					? `No access. Share the sheet with ${serviceAccountEmail} (Editor).`
					: `Could not read sheet: ${msg}`,
			};
		}
	},
);
