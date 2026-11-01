import { httpsCallable } from 'firebase/functions';
import type { FullExportRequest, FullExportResponse } from '@freedi/shared-types';
import { functions } from '../config';
import { logError } from '@/utils/errorHandling';

/**
 * Ask the server for every child of a statement (hidden ones included), already
 * shaped as export rows. Throws when the call fails so the UI can show it.
 */
export async function fetchFullExport(request: FullExportRequest): Promise<FullExportResponse> {
	try {
		const fullExport = httpsCallable<FullExportRequest, FullExportResponse>(
			functions,
			'fullExport',
		);
		const result = await fullExport(request);

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'fullExportController.fetchFullExport',
			statementId: request.statementId,
		});
		throw error;
	}
}
