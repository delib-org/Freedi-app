import firebaseConfig from '@/controllers/db/configKey';
import { setSimilarStatements } from '@/redux/massConsensus/massConsensusSlice';
import { functionConfig } from '@/types/ConfigFunctions';
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useParams } from 'react-router';

interface InitialQuestionVM {
	handleSetInitialSuggestion: (
		ev: React.FormEvent<HTMLFormElement>
	) => Promise<void>;
	ready: boolean;
	loading: boolean;
}

export function useInitialQuestion(): InitialQuestionVM {
	const dispatch = useDispatch();
	const { statementId } = useParams<{ statementId: string }>();

	const [ready, setReady] = useState(false);
	const [loading, setLoading] = useState(false);

	async function handleSetInitialSuggestion(
		ev: React.FormEvent<HTMLFormElement>
	) {
		ev.preventDefault();

		const userInput = ev.currentTarget.userInput.value;
		if (!userInput) return;
		setLoading(true);

		const { optionsInDB, optionsGenerated, userOption } =
			await getSimilarStatements(statementId, userInput);
		dispatch(
			setSimilarStatements([
				...[userOption],
				...optionsInDB,
				...optionsGenerated,
			])
		);
		setReady(true);
		setLoading(false);
	}

	return {
		handleSetInitialSuggestion,
		ready,
		loading,
	};
}

async function getSimilarStatements(statementId: string, userInput: string) {
	try {
		const endPoint =
			location.hostname === 'localhost'
				? `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/checkForSimilarStatements`
				: import.meta.env.VITE_APP_CHECK_SIMILARITIES_ENDPOINT;

		const response = await fetch(endPoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				statementId,
				userInput,
				generateIfNeeded: true,
			}),
		});
		const data = await response.json();
		const { optionsInDB, optionsGenerated, userOption } = data;
		const _userOption = { statement: userOption, statementId: null };
		const _optionsGenerated = optionsGenerated.map((option: string) => ({
			statement: option,
			statementId: null,
		}));

		return {
			optionsInDB,
			optionsGenerated: _optionsGenerated,
			userOption: _userOption,
		};
	} catch (error) {
		console.error('Error:', error);
	}
}
