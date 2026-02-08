import { similarOptionsEndPoint } from "@/services/similarOptions";
import { Statement } from '@freedi/shared-types';

export async function getSimilarOptions(statementId: string, userInput: string, creatorId: string, setError: (error: string) => void): Promise<{ similarStatements: Statement[], similarTexts: string[], userText: string | null } | null> {
	try {

		const endPoint = similarOptionsEndPoint;
		const response = await fetch(endPoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				statementId,
				userInput,
				generateIfNeeded: false,
				creatorId,
			}),
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Failed to fetch similar statements');
		}

		const data = await response.json();

		const { similarStatements, similarTexts, userText } = data;
		
		// Return empty array if no similar statements found (this is not an error condition)
		if (!similarStatements || !Array.isArray(similarStatements) || similarStatements.length === 0) {
			return { similarStatements: [], similarTexts: [], userText: userText || null } as { similarStatements: Statement[], similarTexts: string[], userText: string | null };
		}

		return { similarStatements, similarTexts, userText } as { similarStatements: Statement[], similarTexts: string[], userText: string | null };
	} catch (error) {
		console.error('Error fetching similar options:', error);
		setError(`${error.message}`);

		return null;
	}
}