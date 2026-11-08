import { httpsCallable } from 'firebase/functions';
import type { SearchStatementsRequest, SearchStatementsResponse } from '@freedi/shared-types';
import { functions } from '../config';

const searchStatementsCallable = httpsCallable<SearchStatementsRequest, SearchStatementsResponse>(
	functions,
	'searchStatements',
);

/**
 * Ask the `searchStatements` function to search — for what the app cannot do
 * locally: trees too big to download, subscriptions beyond the local cache,
 * and "similar meaning" hits (vectors are server-only). Errors propagate; the
 * caller logs them with its own context.
 */
export async function searchStatementsOnServer(
	request: SearchStatementsRequest,
): Promise<SearchStatementsResponse> {
	const result = await searchStatementsCallable(request);

	return result.data;
}
