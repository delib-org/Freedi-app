import firebaseConfig from '@/controllers/db/configKey';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { setSimilarStatements } from '@/redux/massConsensus/massConsensusSlice';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { functionConfig, StatementSubscription } from 'delib-npm';
import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router';

interface InitialQuestionVM {
	handleSetInitialSuggestion: () => Promise<void>;
	ifButtonEnabled: boolean;
	ready: boolean;
	subscription: StatementSubscription | undefined;
	error?: string;
}

export function useInitialQuestion(description: string): InitialQuestionVM {
	const dispatch = useDispatch();
	const { statementId } = useParams<{ statementId: string }>();
	const { creator } = useAuthentication();

	const [ready, setReady] = useState(false);
	const [error, setError] = useState('');
	const subscription = useSelector(
		statementSubscriptionSelector(statementId)
	);

	const ifButtonEnabled = useMemo(
		() => description.trim().length > 0,
		[description]
	);

	async function handleSetInitialSuggestion() {
		try {
			if (!ifButtonEnabled) return;
			const creatorId = creator.uid;
			const result = await getSimilarStatements(
				statementId,
				description,
				creatorId,
				setError
			);
			if (error || !result) return;

			const {
				similarStatements = [],
				similarTexts = [],
				userText,
			} = result;
			dispatch(
				setSimilarStatements([
					...[userText],
					...similarTexts,
					...similarStatements,
				])
			);

			setReady(true);
		} catch (error) {
			console.error(error);
		}
	}

	return {
		handleSetInitialSuggestion,
		ifButtonEnabled,
		ready,
		error,
		subscription,
	};
}

async function getSimilarStatements(
	statementId: string,
	userInput: string,
	creatorId: string,
	setError
) {
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
				creatorId,
				generateIfNeeded: true,
			}),
		});
		if (!response.ok) {
			const errorData = await response.json();
			if (response.status === 403) setError(errorData.error);

			throw new Error(errorData.error || 'Server error');
		}

		const data = await response.json();
		if (!data) throw new Error('No data returned from server');

		const { similarStatements, similarTexts = [], userText } = data;

		const _userText = userText.statementId
			? userText
			: { statement: userText, statementId: null };
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
