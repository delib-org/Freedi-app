import { google, sheets_v4 } from 'googleapis';

/**
 * Separate service account from the Google Docs client used by
 * `fn_importGoogleDocs.ts`. Sheets writes are a higher-risk scope than
 * Docs reads, so we isolate the credentials so ops can rotate them
 * independently. Configure via:
 *   GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SHEETS_PRIVATE_KEY   (with literal \n for newlines)
 */
export function getGoogleSheetsClient(): sheets_v4.Sheets | undefined {
	const clientEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
	const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');

	if (!clientEmail || !privateKey) {
		return undefined;
	}

	const auth = new google.auth.GoogleAuth({
		credentials: {
			client_email: clientEmail,
			private_key: privateKey,
		},
		scopes: ['https://www.googleapis.com/auth/spreadsheets'],
	});

	return google.sheets({ version: 'v4', auth });
}

export function getSheetServiceAccountEmail(): string {
	return process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL ?? '';
}

/**
 * Extract the spreadsheet ID from a Google Sheets URL. Returns `undefined`
 * if the URL is malformed.
 */
export function extractSheetId(url: string): string | undefined {
	const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);

	return match?.[1];
}
