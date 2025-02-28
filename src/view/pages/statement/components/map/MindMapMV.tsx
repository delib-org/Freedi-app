import { listenToDescendants } from "@/controllers/db/results/getResults";
import { statementDescendantsSelector, statementSelector } from "@/redux/statements/statementsSlice";
import { useEffect, useState, useRef } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router";
import { resultsByParentId } from "./mapCont";
import { Results } from "@/types/results/Results";
import { Statement } from "@/types/statement/StatementTypes";

export function useMindMap() {
	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));
	const descendants: Statement[] = useSelector(statementDescendantsSelector(statementId));

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

	// Calculate results only when descendants or statement change
	useEffect(() => {
		// Skip if no data yet
		if (!descendants.length || !statement) return;

		// Create a cache key from the current data
		const cacheKey = JSON.stringify({
			statementId: statement.statementId,
			descendantsLength: descendants.length,
			// Only include specific properties to limit unnecessary recalculations
			descendants: descendants
		});

		// Skip processing if we've already processed this exact data
		if (processedDescendants.current === cacheKey) return;

		// Update our processed tracking
		processedDescendants.current = cacheKey;

		try {
			// Calculate new results
			const newResults = resultsByParentId(statement, descendants);

			// Update state only if results actually changed
			setResults(prevResults => {
				const prevResultsStr = JSON.stringify(prevResults);
				const newResultsStr = JSON.stringify(newResults);

				return prevResultsStr === newResultsStr ? prevResults : newResults;
			});
		} catch (error) {
			console.error("Error calculating results:", error);
		}
	}, [descendants, statement]);

	return { descendants, results };
}
