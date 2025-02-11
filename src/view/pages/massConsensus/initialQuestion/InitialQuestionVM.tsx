import React, { useEffect } from 'react';
import { useParams } from 'react-router';

export function useInitialQuestion() {

	const { statementId } = useParams<{ statementId: string }>();

	function handleSetInitialSuggestion(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault();
		const userInput = ev.currentTarget.userInput.value;

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

	useEffect(() => {
		fetch(`http://localhost:5001/delib-v3-dev/us-central1/getQuestionOptions?statementId=${statementId}`)
			.then((response) => response.json())
			.then((data) => console.log(data))
			.catch((error) => console.error('Error:', error));
	}, [statementId]);

	return {
		handleSetInitialSuggestion
	}
}