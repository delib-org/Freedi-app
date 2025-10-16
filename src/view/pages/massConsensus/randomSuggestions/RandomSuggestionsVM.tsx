import { listenToEvaluation } from '@/controllers/db/evaluation/getEvaluation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { APIEndPoint } from '@/controllers/general/helpers';
import { setMassConsensusStatements, statementSelectorById } from '@/redux/statements/statementsSlice';
import {
	setRandomStatements,
	fetchNewRandomBatch,
	prefetchRandomBatches,
	loadNextRandomBatch,
	selectRandomSuggestionsState,
	selectHasPrefetchedBatches,
	prefetchTopStatements,
} from '@/redux/massConsensus/massConsensusSlice';
import {
	Statement,
	MassConsensusPageUrls,
	SelectionFunction,
} from 'delib-npm';

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router';

export function useRandomSuggestions() {
	const navigate = useNavigate();
	const { user, isLoading } = useAuthentication();
	const dispatch = useDispatch();
	const { statementId } = useParams<{ statementId: string }>();
	const [loadingStatements, setLoadingStatements] = useState(true);
	const statement = useSelector(statementSelectorById(statementId || ''));

	// Use new Redux selectors
	const {
		randomStatements: subStatements,
		canGetNewSuggestions,
		isLoadingNew,
		hasPrefetchedBatches,
		currentBatch,
		totalBatchesViewed
	} = useSelector(selectRandomSuggestionsState);

	const navigateToTop = () =>
		navigate(
			`/mass-consensus/${statementId}/${MassConsensusPageUrls.topSuggestions}`
		);

	useEffect(() => {
		if (!isLoading && !user)
			navigate(
				`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`
			);
	}, [user, isLoading]);

	// Initial fetch and prefetch
	useEffect(() => {
		if (statementId && subStatements.length === 0) {
			fetchRandomStatements();
			// Prefetch additional batches for smooth experience
			dispatch(prefetchRandomBatches({ statementId, batchCount: 3 }) as any);
			// Prefetch top statements while user is here
			dispatch(prefetchTopStatements(statementId) as any);
		}
	}, [statementId]);

	// Listen to evaluations
	useEffect(() => {
		if (!user) return;
		const unsubscribes = subStatements.map((subStatement) => {
			return listenToEvaluation(subStatement.statementId, user.uid);
		});

		return () => {
			unsubscribes.forEach((unsubscribe) => unsubscribe());
		};
	}, [subStatements, user]);

	const fetchRandomStatements = async () => {
		if (statementId) {
			try {
				setLoadingStatements(true);

				// Check if we have prefetched data
				if (hasPrefetchedBatches) {
					// Use prefetched batch (instant)
					dispatch(loadNextRandomBatch());
					setLoadingStatements(false);
				} else {
					// Fetch from API
					const endPoint = APIEndPoint('getRandomStatements', {
						parentId: statementId,
						limit: 6,
					});

					const response = await fetch(endPoint);
					if (!response.ok) {
						const { error } = await response.json();
						console.error('Error:', error);
						throw new Error(`HTTP error! status: ${response.status}`);
					}

					const { statements } = await response.json();
					if (!statements) throw new Error('No statements found');

					// Update Redux state
					dispatch(setRandomStatements(statements));
					dispatch(
						setMassConsensusStatements({
							statements,
							selectionFunction: SelectionFunction.random,
						})
					);
					setLoadingStatements(false);
				}

				// Prefetch more batches in background
				dispatch(prefetchRandomBatches({ statementId, batchCount: 2 }) as any);
			} catch (error) {
				console.error('Error:', error);
				setLoadingStatements(false);
			}
		}
	};

	// Get new batch of suggestions
	const getNewSuggestions = async () => {
		if (!statementId) return;

		// Check if we have prefetched batches
		if (hasPrefetchedBatches) {
			// Use prefetched data (instant)
			dispatch(loadNextRandomBatch());
			// Update the statements slice as well
			const state = (window as any).__REDUX_STORE__?.getState();
			if (state?.massConsensus?.randomStatements) {
				dispatch(
					setMassConsensusStatements({
						statements: state.massConsensus.randomStatements,
						selectionFunction: SelectionFunction.random,
					})
				);
			}
		} else {
			// Fetch new batch from API
			await dispatch(fetchNewRandomBatch(statementId) as any).unwrap();
		}

		// Prefetch more batches in background
		dispatch(prefetchRandomBatches({ statementId, batchCount: 2 }) as any);
	};

	return {
		subStatements,
		navigateToTop,
		loadingStatements,
		statement,
		fetchRandomStatements: getNewSuggestions,
		canGetNewSuggestions,
		isLoadingNew,
		currentBatch,
		totalBatchesViewed
	};
}
