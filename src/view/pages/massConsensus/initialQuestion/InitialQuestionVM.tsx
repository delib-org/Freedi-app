import firebaseConfig from '@/controllers/db/configKey';
import { setSimilarStatements } from '@/redux/massConsensus/massConsensusSlice';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { functionConfig, StatementSubscription } from 'delib-npm';
import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router';

interface InitialQuestionVM {
	handleSetInitialSuggestion: () => Promise<void>;
	ifTextFilled: boolean;
	ready: boolean;
	loading: boolean;
	subscription: StatementSubscription | undefined;
}

export function useInitialQuestion(description: string): InitialQuestionVM {
	const dispatch = useDispatch();
	const { statementId } = useParams<{ statementId: string }>();

	const [ready, setReady] = useState(false);
	const [loading, setLoading] = useState(false);
	const subscription = useSelector(
		statementSubscriptionSelector(statementId)
	);

	const ifTextFilled = useMemo(
		() => description.trim().length > 0,
		[description]
	);

	async function handleSetInitialSuggestion() {
		if (!ifTextFilled || loading) return;
		setLoading(true);

		const {
			similarStatements = [],
			similarTexts = [],
			userText,
		} = await getSimilarStatements(statementId, description);

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
		ifTextFilled,
		ready,
		loading,
		subscription,
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
