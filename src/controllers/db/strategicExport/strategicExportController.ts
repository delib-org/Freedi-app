import { getFunctionsUrl, auth } from '../config';
import { logError } from '@/utils/errorHandling';
import { logger } from '@/services/logger';
import type { StrategicExportRequest, StrategicExportResponse } from '@freedi/shared-types';

async function getAdminAuthHeaders(): Promise<Record<string, string>> {
	const idToken = await auth.currentUser?.getIdToken();
	if (!idToken) {
		throw new Error('Not signed in — strategic export requires authentication');
	}

	return {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${idToken}`,
	};
}

interface StrategicExportApiResponse {
	ok: boolean;
	error?: string;
	export?: StrategicExportResponse;
}

/**
 * Call the strategicExport Cloud Function. Returns the parsed export JSON.
 * Throws when the server reports an error so the caller can surface it.
 */
export async function fetchStrategicExport(
	request: StrategicExportRequest,
): Promise<StrategicExportResponse> {
	try {
		const baseUrl = getFunctionsUrl();
		const headers = await getAdminAuthHeaders();
		const response = await fetch(`${baseUrl}/strategicExport`, {
			method: 'POST',
			headers,
			body: JSON.stringify(request),
		});

		const text = await response.text();
		const contentType = response.headers.get('content-type') ?? '';
		let data: StrategicExportApiResponse;
		if (contentType.includes('application/json')) {
			try {
				data = JSON.parse(text) as StrategicExportApiResponse;
			} catch {
				throw new Error(`Server returned invalid JSON (${response.status}): ${text.slice(0, 200)}`);
			}
		} else {
			throw new Error(
				`Server error (${response.status}): ${text.slice(0, 200) || response.statusText}`,
			);
		}

		if (!data.ok || !data.export) {
			throw new Error(data.error || 'Strategic export failed');
		}

		logger.info('Strategic export complete', {
			questionId: data.export.metadata.questionId,
			topics: data.export.topics.length,
			aggregates: data.export.metadata.aggregatesAfterClustering,
			clusteringTriggered: data.export.metadata.clusteringTriggered,
		});

		return data.export;
	} catch (error) {
		logError(error, {
			operation: 'strategicExportController.fetchStrategicExport',
			statementId: request.questionStatementId,
		});
		throw error;
	}
}

/**
 * Trigger a browser download for a strategic export response.
 */
export function downloadStrategicExport(
	exportData: StrategicExportResponse,
	questionId: string,
): void {
	const blob = new Blob([JSON.stringify(exportData, null, 2)], {
		type: 'application/json;charset=utf-8',
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `strategic-report-${questionId}-${exportData.metadata.exportedAt}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
