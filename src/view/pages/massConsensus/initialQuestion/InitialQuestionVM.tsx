import React from 'react';
import { useParams } from 'react-router';

export function useInitialQuestion() {

	const { statementId } = useParams<{ statementId: string }>();

	function handleSetInitialSuggestion(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault();
		const userInput = ev.currentTarget.userInput.value;
		console.log(userInput, statementId)

		fetch(`http://localhost:5001/delib-v3-dev/us-central1/checkForSimilarStatements`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				statementId,
				userInput,
				generateIfNeeded: true
			}),
		})
			.then((response) => response.json())
			.then((data) => console.log(data))
			.catch((error) => console.error('Error:', error));

	}

	return {
		handleSetInitialSuggestion
	}
}