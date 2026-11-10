import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Statement } from '@freedi/shared-types';
import { RANKED_ANSWERS } from '@/constants/common';
import { fetchTopAnswers } from '@/controllers/db/statements/topAnswers';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import {
	addRankedPage,
	mergeRankedTop,
	rankedPagesSelector,
} from '@/redux/answerViews/answerViewsSlice';
import {
	fullyLoadedScopeSelector,
	statementOptionsSelector,
	statementSelector,
} from '@/redux/statements/statementsSlice';
import { logError } from '@/utils/errorHandling';

export interface RankedAnswers {
	/** Set only when the list is cut to the top pages. */
	rankedIds: ReadonlySet<string> | undefined;
	/** The first page has arrived, so the leading answers are known. */
	isTopLoaded: boolean;
	/** Whether this answer belongs in the list being shown. */
	isListed: (answer: Statement) => boolean;
	hasMore: boolean;
	isLoading: boolean;
	loadMore: () => void;
}

/**
 * The top answers by consensus, a page at a time. Off until `enabled`, which
 * callers keep false for anyone the score guard does not let see a ranking.
 *
 * The list is cut to what was fetched only when there is more than a page: a
 * small question shows every answer as they arrive. A cut list has no listener,
 * so it refreshes its top page at most once a minute while the tab is visible.
 * An answer this person just added always shows, wherever it ranks.
 */
export function useRankedAnswers(questionId: string | undefined, enabled: boolean): RankedAnswers {
	const dispatch = useDispatch();
	const creator = useSelector(creatorSelector);
	const uid = creator?.uid;
	const pagesSelect = useMemo(() => rankedPagesSelector(questionId), [questionId]);
	const pages = useSelector(pagesSelect);
	const fullySelect = useMemo(() => fullyLoadedScopeSelector(questionId), [questionId]);
	const fullyLoaded = useSelector(fullySelect) !== undefined;
	const question = useSelector(statementSelector(questionId));
	const optionsSelect = useMemo(() => statementOptionsSelector(questionId), [questionId]);
	const loadedAnswers = useSelector(optionsSelect).length;
	const [isLoading, setIsLoading] = useState(false);
	const inFlightRef = useRef(false);
	const failedRef = useRef<string | undefined>(undefined);
	const fetchedAtRef = useRef(0);
	const openedAtRef = useRef(Date.now());
	const cursor = pages?.cursor;
	const active = enabled && !fullyLoaded && !!questionId;
	const answerCount = Math.max(question?.numberOfOptions ?? 0, loadedAnswers);
	const isCut = active && !!pages && (pages.hasMore || answerCount > RANKED_ANSWERS.PAGE_SIZE);

	const loadPage = useCallback(() => {
		if (!questionId || inFlightRef.current) return;
		inFlightRef.current = true;
		setIsLoading(true);
		fetchTopAnswers(questionId, cursor)
			.then((page) => {
				fetchedAtRef.current = Date.now();
				dispatch(addRankedPage({ questionId, ...page }));
			})
			.catch((error) => {
				failedRef.current = questionId;
				logError(error, { operation: 'useRankedAnswers.loadPage', statementId: questionId });
			})
			.finally(() => {
				inFlightRef.current = false;
				setIsLoading(false);
			});
	}, [questionId, cursor, dispatch]);

	useEffect(() => {
		if (active && !pages && failedRef.current !== questionId) loadPage();
	}, [active, pages, questionId, loadPage]);

	useEffect(() => {
		if (!isCut || !questionId) return;
		const refresh = (): void => {
			if (document.visibilityState !== 'visible' || inFlightRef.current) return;
			if (Date.now() - fetchedAtRef.current < RANKED_ANSWERS.REFRESH_MS) return;
			inFlightRef.current = true;
			fetchTopAnswers(questionId, undefined)
				.then(({ ids }) => {
					fetchedAtRef.current = Date.now();
					dispatch(mergeRankedTop({ questionId, ids }));
				})
				.catch((error) =>
					logError(error, { operation: 'useRankedAnswers.refresh', statementId: questionId }),
				)
				.finally(() => {
					inFlightRef.current = false;
				});
		};
		const timer = window.setInterval(refresh, RANKED_ANSWERS.REFRESH_MS);
		document.addEventListener('visibilitychange', refresh);

		return () => {
			window.clearInterval(timer);
			document.removeEventListener('visibilitychange', refresh);
		};
	}, [isCut, questionId, dispatch]);

	const rankedIds = useMemo(
		() => (isCut && pages ? new Set(pages.ids) : undefined),
		[isCut, pages],
	);
	const isListed = useCallback(
		(answer: Statement): boolean => {
			if (!rankedIds || rankedIds.has(answer.statementId)) return true;
			const justAddedSince = openedAtRef.current - RANKED_ANSWERS.JUST_ADDED_WINDOW_MS;

			return answer.creatorId === uid && answer.createdAt >= justAddedSince;
		},
		[rankedIds, uid],
	);

	return {
		rankedIds,
		isTopLoaded: active && !!pages,
		isListed,
		hasMore: active && !!pages?.hasMore,
		isLoading,
		loadMore: loadPage,
	};
}
