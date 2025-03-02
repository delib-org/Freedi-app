import { listenToDescendants } from "@/controllers/db/results/getResults";
import { statementDescendantsSelector, statementSelector } from "@/redux/statements/statementsSlice";
import { useEffect, useState, useRef } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router";
import { resultsByParentId } from "./mapCont";
import { Results } from "@/types/results/Results";
import { Statement } from "@/types/statement/StatementTypes";

import { useMemo } from "react";

export function useMindMap() {
	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));
	const descendants: Statement[] = useSelector(statementDescendantsSelector(statementId));

	// Get descendants
	useEffect(() => {
		if (!statementId) return;

		const unsubscribe = listenToDescendants(statementId);
		return () => unsubscribe();
	}, [statementId]);

	// Use memoization for better performance
	// Only recalculate when statement or descendants change significantly
	const results = useMemo(() => {
		if (!descendants.length || !statement) return null;
		
		try {
			// Create a minimal representation of descendants to avoid unnecessary recalculations
			// We only need to track the IDs and parent-child relationships for the mind map
			const descendantIds = descendants.map(d => ({
				id: d.statementId,
				parentId: d.parentId,
				deliberativeElement: d.deliberativeElement
			}));
            
			// Calculate results only if we have the necessary data
			return resultsByParentId(statement, descendants);
		} catch (error) {
			console.error("Error calculating results:", error);
			return null;
		}
	}, [
		statement?.statementId, 
		// Use a stable dependency array by converting descendants to a string of IDs
		// This prevents unnecessary recalculations
		descendants.map(d => d.statementId).join(',')
	]);

	return { descendants, results };
}
