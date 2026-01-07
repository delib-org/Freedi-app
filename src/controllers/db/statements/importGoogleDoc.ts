/**
 * Controller for importing Google Docs into statements
 */

import { getFunctions } from 'firebase/functions';
import { Statement, Paragraph } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

interface ImportRequest {
	documentUrl: string;
	statementId: string;
	userId: string;
}

interface ImportResponse {
	success: boolean;
	paragraphs?: Paragraph[];
	documentTitle?: string;
	error?: string;
	serviceAccountEmail?: string;
}

/**
 * Import a Google Doc into a statement as paragraphs
 * @param documentUrl - The Google Docs URL
 * @param statement - The statement to import into
 * @param userId - The current user's ID
 * @returns The import result
 */
export async function importGoogleDocToStatement(
	documentUrl: string,
	statement: Statement,
	userId: string
): Promise<ImportResponse> {
	try {
		// Initialize functions (may be needed for future httpsCallable usage)
		getFunctions();

		// Get the function URL based on environment
		const isProduction = import.meta.env.PROD;
		const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

		const functionUrl = isProduction
			? `https://us-central1-${projectId}.cloudfunctions.net/importGoogleDoc`
			: `http://localhost:5001/${projectId}/us-central1/importGoogleDoc`;

		const response = await fetch(functionUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				documentUrl,
				statementId: statement.statementId,
				userId,
			} as ImportRequest),
		});

		const data = (await response.json()) as ImportResponse;

		return data;
	} catch (error) {
		logError(error, {
			operation: 'importGoogleDoc.importGoogleDocToStatement',
			statementId: statement.statementId,
			userId,
		});

		return {
			success: false,
			error: 'Failed to import document. Please try again.',
		};
	}
}
