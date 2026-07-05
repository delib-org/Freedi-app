import { useEffect, useRef, useState } from 'react';
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
 */
export function useAutoLoadAllForSort(
	statementId: string | undefined,
	sort: string | undefined,
): { isAutoLoading: boolean } {
	const dispatch = useDispatch();
	const fullyLoadedScope = useSelector(fullyLoadedScopeSelector(statementId));
	const [isAutoLoading, setIsAutoLoading] = useState(false);
	const loadingRef = useRef(false);

	useEffect(() => {
		if (!statementId) return;
		if (!sort || !RANKED_SORTS.has(sort)) return;
		if (fullyLoadedScope || loadingRef.current) return;

		loadingRef.current = true;
		let cancelled = false;
		setIsAutoLoading(true);

		bulkLoadStatements(statementId, 'direct')
			.then(({ watermark }) => {
				if (cancelled) return;
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
				loadingRef.current = false;
				if (!cancelled) setIsAutoLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [statementId, sort, fullyLoadedScope, dispatch]);

	return { isAutoLoading };
}
