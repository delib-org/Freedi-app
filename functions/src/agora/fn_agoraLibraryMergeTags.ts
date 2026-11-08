import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
	LibraryMergeTagsRequest,
	LibraryMergeTagsResponse,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';
import { mergeTags } from './libraryTags';

/**
 * A sys-admin merges a duplicate tag into the canonical one. The duplicate
 * stays as a pointer (`aliasOf`) so old links and stale clients still resolve;
 * every scenario is re-pointed and the counters are kept exact (see
 * `mergeTags`). Safe to run again if it was interrupted.
 */
export const agoraLibraryMergeTags = onCall(
	{ region: functionConfig.region, timeoutSeconds: 300 },
	async (request: CallableRequest<LibraryMergeTagsRequest>): Promise<LibraryMergeTagsResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (!(await isSystemAdmin(uid))) {
			throw new HttpsError('permission-denied', 'Only a system admin can merge tags');
		}
		const { fromId, intoId } = request.data ?? ({} as LibraryMergeTagsRequest);
		if (!fromId || !intoId || typeof fromId !== 'string' || typeof intoId !== 'string') {
			throw new HttpsError('invalid-argument', 'fromId and intoId are required');
		}

		try {
			return { scenarios: await mergeTags(fromId, intoId) };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.libraryMergeTags',
				userId: uid,
				metadata: { fromId, intoId },
			});
			throw new HttpsError('internal', 'Failed to merge the tags');
		}
	},
);
