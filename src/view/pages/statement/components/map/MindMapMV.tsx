import { listenToDescendants } from '@/controllers/db/results/getResults';
import {
	statementDescendantsSelector,
	statementSelector,
} from '@/redux/statements/statementsSlice';
import { useEffect, useState, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';
import { resultsByParentId } from './mapCont';
import { Statement, Results } from 'delib-npm';
import { APIEndPoint, isChatMessage } from '@/controllers/general/helpers';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';

export function useMindMap() {
	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));
	const allDescendants: Statement[] = useSelector(
		statementDescendantsSelector(statementId)
	);
	const descendants = allDescendants.filter(
		(statement) => !isChatMessage(statement.statementType)
	);

	const [flat, setFlat] = useState(false);
	const [loading, setLoading] = useState(false);

	// Use a ref to track if we've already processed these descendants
	const processedDescendants = useRef<string | null>(null);

	// Initialize results state properly
	const [results, setResults] = useState<Results | null>(null);

	// Get descendants
	useEffect(() => {
		if (!statementId) return;

		const unsubscribe = listenToDescendants(statementId);

		return () => {
			unsubscribe();
		};
	}, [statementId]);
	useEffect(() => {
		if (!statementId) return;

		const unsubscribes = allDescendants.map(
			(statement) => listenToEvaluations(statement.statementId) // assuming listenToEvaluation takes a statementId
		);

		return () => {
			unsubscribes.forEach((unsubscribe) => {
				if (typeof unsubscribe === 'function') {
					unsubscribe();
				}
			});
		};
	}, [allDescendants]);
	useEffect(() => {
		setFlat(isFlat(descendants, statementId));
	}, [descendants.length, statementId]);

	// Calculate results only when descendants or statement change
	useEffect(() => {
		// Skip if no data yet
		if (!statement) return;

		// Create a cache key from the current data
		const cacheKey = JSON.stringify({
			statementId: statement.statementId,
			descendantsLength: descendants.length,
			// Only include specific properties to limit unnecessary recalculations
			descendants: descendants,
		});

		// Skip processing if we've already processed this exact data
		if (processedDescendants.current === cacheKey) return;

		// Update our processed tracking
		processedDescendants.current = cacheKey;

		try {
			// Calculate new results
			const newResults = resultsByParentId(statement, descendants);

			// Update state only if results actually changed
			setResults((prevResults) => {
				const prevResultsStr = JSON.stringify(prevResults);
				const newResultsStr = JSON.stringify(newResults);

				return prevResultsStr === newResultsStr
					? prevResults
					: newResults;
			});
		} catch (error) {
			console.error('Error calculating results:', error);
		}
	}, [descendants, statement]);

	function handleCluster(statementId: string) {
		setLoading(true);
		const endPoint = APIEndPoint('getCluster', {});
		fetch(endPoint, {
			method: 'POST',
			body: JSON.stringify({
				statementId,
			}),
			headers: {
				'Content-Type': 'application/json',
			},
		})
			.catch((error) => {
				console.error('Error fetching cluster data:', error);
			})
			.finally(() => {
				setLoading(false);
			});
	}

	function handleRecoverSnapshot(statementId: string) {
		setLoading(true);
		const endPoint = APIEndPoint('recoverLastSnapshot', {});
		fetch(endPoint, {
			method: 'POST',
			body: JSON.stringify({ snapshotId: statementId }),
			headers: {
				'Content-Type': 'application/json',
			},
		})
			.catch((error) => {
				console.error('Error fetching recover snapshot data:', error);
			})
			.finally(() => {
				setLoading(false);
			});
	}

	return {
		descendants,
		results,
		loading,
		handleRecoverSnapshot,
		handleCluster,
		flat,
	};
}

function isFlat(descendants: Statement[], statementId: string) {
	return !descendants.some(
		(descendant) =>
			descendant.isCluster && descendant.parentId === statementId
	);
}
