import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { SortType } from '@freedi/shared-types';
import { bulkLoadStatements } from '@/controllers/db/statements/bulkLoadStatements';
import { fullyLoadedScopeSelector, setScopeFullyLoaded } from '@/redux/statements/statementsSlice';
import { logError } from '@/utils/errorHandling';

/**
 * Sorts whose ordering key is NOT `createdAt desc` (the order the page's
 * windowed listener loads in). For these, a client-side sort over the loaded
 * window is wrong/incomplete — the genuinely top-ranked options may be older
 * than the window and not in the store yet. So we eagerly load the full set.
 *
 * `newest` / `random` / `backend-order` are intentionally excluded: they're
 * already correct over the windowed list (or order is irrelevant).
 */
const RANKED_SORTS: ReadonlySet<string> = new Set<string>([
	SortType.accepted,
	SortType.averageEvaluation,
	SortType.mostJoined,
	SortType.mostUpdated,
]);

/**
 * When a ranked sort is active, bulk-load all direct children of `statementId`
 * (once) so the client-side comparator ranks the complete set rather than just
 * the most-recent window. No-op for chronological sorts and for scopes already
 * fully loaded.
 *
 * A load is not cancelled by the effect's cleanup: its own dispatch re-runs the
 * effect, and the pages it fetched are already in the store whoever is watching.
 */
export function useAutoLoadAllForSort(
	statementId: string | undefined,
	sort: string | undefined,
): { isAutoLoading: boolean } {
	const dispatch = useDispatch();
	const loadedSelector = useMemo(() => fullyLoadedScopeSelector(statementId), [statementId]);
	const fullyLoadedScope = useSelector(loadedSelector);
	const [loadingScopeId, setLoadingScopeId] = useState<string | undefined>(undefined);
	const inFlightScopes = useRef(new Set<string>());
	const isRankedSort = !!sort && RANKED_SORTS.has(sort);

	useEffect(() => {
		if (!statementId || !isRankedSort) return;
		if (fullyLoadedScope || inFlightScopes.current.has(statementId)) return;

		inFlightScopes.current.add(statementId);
		setLoadingScopeId(statementId);

		bulkLoadStatements(statementId, 'direct')
			.then(({ watermark }) => {
				dispatch(setScopeFullyLoaded({ rootId: statementId, mode: 'direct', watermark }));
			})
			.catch((error) =>
				logError(error, {
					operation: 'useAutoLoadAllForSort.bulkLoad',
					statementId,
					metadata: { sort },
				}),
			)
			.finally(() => {
				inFlightScopes.current.delete(statementId);
				setLoadingScopeId((current) => (current === statementId ? undefined : current));
			});
	}, [statementId, sort, isRankedSort, fullyLoadedScope, dispatch]);

	return { isAutoLoading: isRankedSort && !!statementId && loadingScopeId === statementId };
}
