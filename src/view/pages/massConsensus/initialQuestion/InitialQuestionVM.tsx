import { setSimilarStatements } from '@/redux/massConsensus/massConsensusSlice';
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useParams } from 'react-router';

interface InitialQuestionVM {
	handleSetInitialSuggestion: (ev: React.FormEvent<HTMLFormElement>) => Promise<void>;
	ready: boolean;
	loading: boolean;
}

export function useInitialQuestion(): InitialQuestionVM {
	const dispatch = useDispatch();
	const { statementId } = useParams<{ statementId: string }>();

	const [ready, setReady] = useState(false);
	const [loading, setLoading] = useState(false);

	async function handleSetInitialSuggestion(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault();
		setLoading(true);
		const userInput = ev.currentTarget.userInput.value;
		const { optionsInDB, optionsGenerated } = await getSimilarStatements(statementId, userInput)
		dispatch(setSimilarStatements([...optionsInDB, ...optionsGenerated]));
		setReady(true);
		setLoading(false);

	}

	return {
		handleSetInitialSuggestion,
		ready,
		loading
	}
}

async function getSimilarStatements(statementId: string, userInput: string) {
	try {
		const response = await fetch(`http://localhost:5001/delib-v3-dev/us-central1/checkForSimilarStatements`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				statementId,
				userInput,
				generateIfNeeded: true
			}),
		});
		const data = await response.json();
		const { optionsInDB, optionsGenerated } = data;

		const _optionsGenerated = optionsGenerated.map((option: string) => ({ statement: option, statementId: null }));

		return { optionsInDB, optionsGenerated: _optionsGenerated };
	} catch (error) {
		console.error('Error:', error);
	}
}