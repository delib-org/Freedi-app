import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { SortType } from '@freedi/shared-types';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { uxAnalytics } from '@/services/analytics';
import {
	buildStatementPath,
	parseStatementPath,
	resolveTabView,
	StatementTabView,
	StatementView,
} from '@/routes/statementPaths';

interface NavigateOptions {
	replace?: boolean;
}

export interface StatementViewState {
	statementId: string | undefined;
	/** The view named in the URL, or undefined when the question shows its default tab. */
	view: StatementView | undefined;
	/** The segmented-control tab to highlight (explicit view, or the question's default view). */
	tab: StatementTabView;
	/** `?sort=` from the URL, undefined when the question's default ranking applies. */
	sort: SortType | undefined;
	/** Everything in the query string other than `sort`. */
	rest: URLSearchParams;
	setView: (view: StatementView | undefined, options?: NavigateOptions) => void;
	setSort: (sort: SortType | undefined, options?: NavigateOptions) => void;
}

const RANDOM_SEED_PARAM = 't';

/** Read both statement URL families without rewriting current query/hash links. */
export function useStatementView(): StatementViewState {
	const { statementId: paramId } = useParams<{ statementId?: string; view?: string }>();
	const { pathname, search } = useLocation();
	const navigate = useNavigate();

	const parsed = useMemo(() => parseStatementPath(pathname, search), [pathname, search]);
	const statementId = parsed?.statementId ?? paramId;
	const statement = useSelector(statementSelector(statementId));
	const defaultView = statement?.statementSettings?.defaultView;

	const view = parsed?.view;
	const sort = parsed?.sort;
	const rest = useMemo(() => parsed?.rest ?? new URLSearchParams(), [parsed]);
	const tab = resolveTabView(view, defaultView);

	const setView = useCallback(
		(nextView: StatementView | undefined, options?: NavigateOptions) => {
			if (!statementId) return;
			uxAnalytics.viewSwitched(statementId, view ?? null, nextView ?? 'default');
			navigate(buildStatementPath({ statementId, view: nextView, sort, query: rest }), {
				replace: options?.replace,
			});
		},
		[navigate, statementId, view, sort, rest],
	);

	const setSort = useCallback(
		(nextSort: SortType | undefined, options?: NavigateOptions) => {
			if (!statementId) return;
			const query = new URLSearchParams(rest);
			// A fresh seed each time random is picked, so re-choosing it reshuffles.
			if (nextSort === SortType.random) {
				query.set(RANDOM_SEED_PARAM, String(Date.now()));
			} else {
				query.delete(RANDOM_SEED_PARAM);
			}
			navigate(buildStatementPath({ statementId, view, sort: nextSort, query }), {
				replace: options?.replace,
			});
		},
		[navigate, statementId, view, rest],
	);

	return useMemo(
		() => ({ statementId, view, tab, sort, rest, setView, setSort }),
		[statementId, view, tab, sort, rest, setView, setSort],
	);
}

export default useStatementView;
