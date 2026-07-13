import { getFunctionsUrl, auth } from '../config';
import { logError } from '@/utils/errorHandling';
import { logger } from '@/services/logger';
import { convertToCSV } from '@/utils/privacyExportUtils';
import { downloadFile } from '@/utils/exportUtils';
import type { PrivacyPreservingExportData } from '@/types/privacyExport';
import type { ExportFormat } from '@/types/export';

export interface PrivacyExportRequest {
	statementId: string;
	kAnonymityThreshold?: number;
}

interface PrivacyExportApiResponse {
	ok: boolean;
	error?: string;
	export?: PrivacyPreservingExportData;
}

async function getAdminAuthHeaders(): Promise<Record<string, string>> {
	const idToken = await auth.currentUser?.getIdToken();
	if (!idToken) {
		throw new Error('Not signed in — privacy export requires authentication');
	}

	return {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${idToken}`,
	};
}

/**
 * Call the privacyExport Cloud Function. The server reads all options and every
 * user's raw evaluations/demographic answers with the Admin SDK, aggregates
 * with k-anonymity suppression, and returns only the anonymized result — so the
 * option list is always complete and the raw data never reaches the client.
 * Throws when the server reports an error so the caller can fall back.
 */
export async function fetchPrivacyExport(
	request: PrivacyExportRequest,
): Promise<PrivacyPreservingExportData> {
	try {
		const baseUrl = getFunctionsUrl();
		const headers = await getAdminAuthHeaders();
		const response = await fetch(`${baseUrl}/privacyExport`, {
			method: 'POST',
			headers,
			body: JSON.stringify(request),
		});

		const text = await response.text();
		const contentType = response.headers.get('content-type') ?? '';
		let data: PrivacyExportApiResponse;
		if (contentType.includes('application/json')) {
			try {
				data = JSON.parse(text) as PrivacyExportApiResponse;
			} catch {
				throw new Error(`Server returned invalid JSON (${response.status}): ${text.slice(0, 200)}`);
			}
		} else {
			throw new Error(
				`Server error (${response.status}): ${text.slice(0, 200) || response.statusText}`,
			);
		}

		if (!data.ok || !data.export) {
			throw new Error(data.error || 'Privacy export failed');
		}

		logger.info('Privacy export complete', {
			statementId: request.statementId,
			totalRecords: data.export.metadata.totalRecords,
			totalEvaluators: data.export.metadata.totalEvaluators,
			suppressedGroups: data.export.metadata.suppressedGroupCount,
		});

		return data.export;
	} catch (error) {
		logError(error, {
			operation: 'privacyExportController.fetchPrivacyExport',
			statementId: request.statementId,
		});
		throw error;
	}
}

/**
 * Trigger a browser download of a privacy export payload in the given format.
 */
export function downloadPrivacyExport(
	data: PrivacyPreservingExportData,
	parentStatementText: string,
	format: ExportFormat,
): void {
	const timestamp = new Date().toISOString().split('T')[0];
	const safeTitle = parentStatementText.slice(0, 30).replace(/[^\p{L}\p{N}]/gu, '_');

	if (format === 'json') {
		downloadFile(
			JSON.stringify(data, null, 2),
			`freedi_user_data_export_${safeTitle}_${timestamp}.json`,
			'application/json',
		);
	} else {
		downloadFile(
			convertToCSV(data),
			`freedi_user_data_export_${safeTitle}_${timestamp}.csv`,
			'text/csv',
		);
	}
}
