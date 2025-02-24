import firebaseConfig from '@/controllers/db/configKey';
import { setSimilarStatements } from '@/redux/massConsensus/massConsensusSlice';
import { functionConfig } from '@/types/ConfigFunctions';
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useParams } from 'react-router';

interface InitialQuestionVM {
	handleSetInitialSuggestion: () => Promise<void>;
	changeInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
	ifButtonEnabled: boolean;
	ready: boolean;
	loading: boolean;
}

export function useInitialQuestion(): InitialQuestionVM {
	const dispatch = useDispatch();
	const { statementId } = useParams<{ statementId: string }>();

	const [ input, setInput ] = useState("");
	const [ ifButtonEnabled, EnableButton] = useState(false);
	const [ ready, setReady ] = useState(false);
	const [ loading, setLoading ] = useState(false);

	const changeInput = (event: React.ChangeEvent<HTMLInputElement>) => 
	{
		setInput(event.target.value);
		EnableButton(event.target.value.length > 0);
	}

	async function handleSetInitialSuggestion() {
		if (!input) return;
		setLoading(true);

		const { similarStatements = [], similarTexts = [], userText } =
			await getSimilarStatements(statementId, input);

		dispatch(
			setSimilarStatements([
				...[userText],
				...similarTexts,
				...similarStatements,
			])
		);
		setReady(true);
		setLoading(false);
	}

	return {
		handleSetInitialSuggestion,
		changeInput,
		ifButtonEnabled,
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
		if (!data) throw new Error('No data returned from server');
		const { similarStatements, similarTexts = [], userText } = data;
		
		const _userText = { statement: userText, statementId: null };
		const _similarTexts = similarTexts.map((text: string) => ({
			statement: text,
			statementId: null,
		}));

		return {
			similarStatements,
			similarTexts: _similarTexts,
			userText: _userText,
		};
	} catch (error) {
		console.error('Error:', error);
	}
}
