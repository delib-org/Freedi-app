import { similarOptionsEndPoint } from '@/services/similarOptions';
import { Statement } from '@freedi/shared-types';
import { logError, NetworkError } from '@/utils/errorHandling';
import { getAuthHeaders } from '@/controllers/db/authHeaders';
import { ContentRejection, parseContentRejection } from '@/helpers/contentRejection';

export interface SimilarOptionsFound {
	rejected: false;
	similarStatements: Statement[];
	similarTexts: string[];
	userText: string | null;
}

export interface SimilarOptionsRejected extends ContentRejection {
	rejected: true;
}

/**
 * Three outcomes: matches (possibly none), the moderator refused the text, or
 * null when the check itself failed. Callers publish on null, so a server
 * outage never stops people from adding answers; they must not on `rejected`.
 */
export async function getSimilarOptions(
	statementId: string,
	userInput: string,
	creatorId: string,
	setError: (error: string) => void,
): Promise<SimilarOptionsFound | SimilarOptionsRejected | null> {
	try {
		const endPoint = similarOptionsEndPoint;
		const response = await fetch(endPoint, {
			method: 'POST',
			headers: await getAuthHeaders(),
			body: JSON.stringify({
				statementId,
				userInput,
				generateIfNeeded: false,
				creatorId,
			}),
		});

		if (!response.ok) {
			const errorData: unknown = await response.json().catch(() => null);
			const rejection = parseContentRejection(response.status, errorData);
			if (rejection) return { rejected: true, ...rejection };

			throw new NetworkError(
				(errorData as { error?: string } | null)?.error || 'Failed to fetch similar statements',
				{ status: response.status, statementId },
			);
		}

		const data = await response.json();

		const { similarStatements, similarTexts, userText } = data;

		// Return empty array if no similar statements found (this is not an error condition)
		if (!similarStatements || !Array.isArray(similarStatements) || similarStatements.length === 0) {
			return {
				rejected: false,
				similarStatements: [],
				similarTexts: [],
				userText: userText || null,
			};
		}

		return { rejected: false, similarStatements, similarTexts, userText };
	} catch (error) {
		logError(error, {
			operation: '01-form.GetInitialStatementDataCont.unknown',
			metadata: { message: 'Error fetching similar options:' },
		});
		setError(`${error.message}`);

		return null;
	}
}
