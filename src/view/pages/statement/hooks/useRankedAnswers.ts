import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTopAnswers } from '@/controllers/db/statements/topAnswers';
import { addRankedPage, rankedPagesSelector } from '@/redux/answerViews/answerViewsSlice';
import { fullyLoadedScopeSelector } from '@/redux/statements/statementsSlice';
import { logError } from '@/utils/errorHandling';

export interface RankedAnswers {
	/** The answers fetched so far; undefined when the whole list should show. */
	rankedIds: ReadonlySet<string> | undefined;
	hasMore: boolean;
	isLoading: boolean;
	loadMore: () => void;
}

/**
 * The top answers by consensus, a page at a time. Off until `enabled`, which
 * callers keep false for anyone the score guard does not let see a ranking.
 * When every answer is in the store (loaded by "Load all"), it steps aside.
 */
export function useRankedAnswers(questionId: string | undefined, enabled: boolean): RankedAnswers {
	const dispatch = useDispatch();
	const pagesSelect = useMemo(() => rankedPagesSelector(questionId), [questionId]);
	const pages = useSelector(pagesSelect);
	const fullySelect = useMemo(() => fullyLoadedScopeSelector(questionId), [questionId]);
	const fullyLoaded = useSelector(fullySelect) !== undefined;
	const [isLoading, setIsLoading] = useState(false);
	const inFlightRef = useRef(false);
	const failedRef = useRef<string | undefined>(undefined);
	const cursor = pages?.cursor;
	const active = enabled && !fullyLoaded && !!questionId;

	const loadPage = useCallback(() => {
		if (!questionId || inFlightRef.current) return;
		inFlightRef.current = true;
		setIsLoading(true);
		fetchTopAnswers(questionId, cursor)
			.then((page) => dispatch(addRankedPage({ questionId, ...page })))
			.catch((error) => {
				failedRef.current = questionId;
				logError(error, {
					operation: 'useRankedAnswers.loadPage',
					statementId: questionId,
				});
			})
			.finally(() => {
				inFlightRef.current = false;
				setIsLoading(false);
			});
	}, [questionId, cursor, dispatch]);

	useEffect(() => {
		if (active && !pages && failedRef.current !== questionId) loadPage();
	}, [active, pages, questionId, loadPage]);

	const rankedIds = useMemo(
		() => (active && pages ? new Set(pages.ids) : undefined),
		[active, pages],
	);

	return { rankedIds, hasMore: active && !!pages?.hasMore, isLoading, loadMore: loadPage };
}
