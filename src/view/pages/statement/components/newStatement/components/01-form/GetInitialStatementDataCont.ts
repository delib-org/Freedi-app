import { similarOptionsEndPoint } from "@/services/similarOptions";
import { Statement } from "delib-npm";

export async function getSimilarOptions(statementId: string, userInput: string, creatorId: string, setError: (error: string) => void): Promise<Statement[] | null> {
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
				creatorId,
			}),
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Failed to fetch similar statements');
		}

		const data = await response.json();

		const { similarStatements } = data;
		if (!similarStatements || !Array.isArray(similarStatements)) {
			throw new Error('No similar statements found');
		}

		return similarStatements as Statement[];
	} catch (error) {
		console.error('Error fetching similar options:', error);
		setError(`${error.message}`);

		return null;
	}
}