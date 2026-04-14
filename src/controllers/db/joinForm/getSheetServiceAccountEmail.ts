import { httpsCallable } from 'firebase/functions';
import { functions } from '@/controllers/db/config';
import { logError } from '@/utils/errorHandling';

interface GetSheetServiceAccountEmailResult {
	email: string;
}

let cachedEmail: string | undefined;

/**
 * Returns the service account email that admins must share their Google
 * Sheet with. Cached after the first call for the session. Returns `undefined`
 * if the backend config isn't set up yet — the UI should hide the hint row
 * in that case rather than break.
 */
export async function getSheetServiceAccountEmail(): Promise<string | undefined> {
	if (cachedEmail !== undefined) return cachedEmail || undefined;

	try {
		const callable = httpsCallable<unknown, GetSheetServiceAccountEmailResult>(
			functions,
			'getSheetServiceAccountEmail',
		);
		const result = await callable({});
		cachedEmail = result.data.email ?? '';

		return cachedEmail || undefined;
	} catch (error) {
		logError(error, { operation: 'joinForm.getSheetServiceAccountEmail' });
		cachedEmail = '';

		return undefined;
	}
}
