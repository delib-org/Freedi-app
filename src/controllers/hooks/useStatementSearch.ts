import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
	SEARCH_CONFIG,
	isSearchCandidate,
	isTopLevelSearchCandidate,
	normalizeSearchText,
	rankCandidates,
	statementToSearchCandidate,
	subscriptionToSearchCandidate,
	type SearchCandidate,
	type SearchMatch,
	type SearchScope,
	type SearchStatementsResponse,
} from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import {
	fullyLoadedScopeSelector,
	setScopeFullyLoaded,
	statementsSelector,
	statementsSubscriptionsSelector,
} from '@/redux/statements/statementsSlice';
import {
	searchCandidateCacheSelector,
	setSearchCandidates,
	type SubscriptionSearchScope,
} from '@/redux/search/searchSlice';
import { fetchSubscriptionCandidates } from '@/controllers/db/search/getSearchCandidates';
import { searchStatementsOnServer } from '@/controllers/db/search/searchStatementsOnServer';
import {
	bulkLoadStatements,
	getStatementsCount,
} from '@/controllers/db/statements/bulkLoadStatements';
import { SEARCH } from '@/constants/common';
import { logError } from '@/utils/errorHandling';

/**
 * Search statements in one scope, as the user types.
 *
 *  home / subscriptions  rank the caller's subscriptions locally: the ones the
 *                        home listeners already hold, plus a one-off download
 *                        of up to SEARCH.SUBSCRIPTIONS_CANDIDATE_LIMIT (cached).
 *                        When that download was cut off, the server also
 *                        searches the rest.
 *  tree                  small trees are loaded whole and ranked locally; trees
 *                        above SEARCH.SERVER_TREE_THRESHOLD are ranked on the
 *                        server. "Similar meaning" hits always come from the
 *                        server (vectors never reach the client).
 *
 * Lexical results appear after SEARCH.DEBOUNCE_MS; server results after
 * SEARCH.SERVER_DEBOUNCE_MS. Semantic hits never repeat a lexical hit.
 */

type TreeMode = 'pending' | 'local' | 'server';

export interface StatementSearchState {
	/** The (debounced) query the results belong to. */
	query: string;
	lexical: SearchMatch[];
	semantic: SearchMatch[];
	/** True while there is not yet anything meaningful to show for the query. */
	isLoading: boolean;
	/** True while the whole tree is being downloaded for local search. */
	isLoadingTree: boolean;
	/** True while "similar meaning" hits are on their way. */
	isSearchingMeaning: boolean;
	/** Server-ranked trees: how many statements were searched, out of how many. */
	coverage: SearchStatementsResponse['coverage'] | null;
	hasError: boolean;
}

interface ServerResult {
	key: string;
	response: SearchStatementsResponse | null;
	loading: boolean;
	error: boolean;
}

const EMPTY_STATE: StatementSearchState = {
	query: '',
	lexical: [],
	semantic: [],
	isLoading: false,
	isLoadingTree: false,
	isSearchingMeaning: false,
	coverage: null,
	hasError: false,
};

function scopeKeyOf(scope: SearchScope | null): string {
	if (!scope) return '';

	return scope.kind === 'tree' ? `tree:${scope.rootId}` : scope.kind;
}

function scopeFromKey(key: string): SearchScope | null {
	if (key === 'home' || key === 'subscriptions') return { kind: key };
	if (key.startsWith('tree:')) return { kind: 'tree', rootId: key.slice('tree:'.length) };

	return null;
}

/** Local matches first, then server-only matches, best score first. */
function mergeLexical(local: SearchMatch[], server: SearchMatch[] | undefined): SearchMatch[] {
	if (!server || server.length === 0) return local;
	const localIds = new Set(local.map((match) => match.candidate.statementId));
	const extra = server.filter((match) => !localIds.has(match.candidate.statementId));

	return [...local, ...extra]
		.sort((a, b) => b.score - a.score || b.candidate.lastUpdate - a.candidate.lastUpdate)
		.slice(0, SEARCH_CONFIG.MAX_RESULTS);
}

export function useStatementSearch(scope: SearchScope | null, query: string): StatementSearchState {
	const dispatch = useDispatch();
	const trimmed = query.trim();
	const [debounced, setDebounced] = useState(trimmed);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(trimmed), SEARCH.DEBOUNCE_MS);

		return () => clearTimeout(timer);
	}, [trimmed]);

	// Callers usually pass a fresh scope object each render; everything below keys off this string.
	const scopeKey = scopeKeyOf(scope);
	const stableScope = useMemo(() => scopeFromKey(scopeKey), [scopeKey]);
	const rootId = stableScope?.kind === 'tree' ? stableScope.rootId : undefined;
	const subscriptionScope: SubscriptionSearchScope | undefined =
		stableScope?.kind === 'home' || stableScope?.kind === 'subscriptions'
			? stableScope.kind
			: undefined;

	const active =
		stableScope !== null && normalizeSearchText(debounced).length >= SEARCH_CONFIG.MIN_QUERY_LENGTH;
	const wantsMeaning =
		rootId !== undefined && debounced.length >= SEARCH_CONFIG.MIN_SEMANTIC_QUERY_LENGTH;

	const user = useAppSelector(creatorSelector);
	const userId = user?.uid;
	const statements = useAppSelector(statementsSelector);
	const subscriptions = useAppSelector(statementsSubscriptionsSelector);
	const cacheSelector = useMemo(
		() => searchCandidateCacheSelector(subscriptionScope ?? 'home', userId),
		[subscriptionScope, userId],
	);
	const cache = useAppSelector(cacheSelector);
	const fullyLoadedSelector = useMemo(() => fullyLoadedScopeSelector(rootId), [rootId]);
	const fullyLoaded = useAppSelector(fullyLoadedSelector);

	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;

		return () => {
			mounted.current = false;
		};
	}, []);

	// ── Candidates for subscription scopes ────────────────────────────────
	const [fetchingScope, setFetchingScope] = useState<SubscriptionSearchScope | null>(null);
	const [candidateError, setCandidateError] = useState(false);
	const fetching = useRef(new Set<SubscriptionSearchScope>());

	useEffect(() => {
		if (!active || !subscriptionScope || !userId) return;
		const fresh = cache !== undefined && Date.now() - cache.fetchedAt < SEARCH.CACHE_TTL_MS;
		if (fresh || fetching.current.has(subscriptionScope)) return;

		fetching.current.add(subscriptionScope);
		setFetchingScope(subscriptionScope);
		setCandidateError(false);

		fetchSubscriptionCandidates(userId, subscriptionScope === 'home')
			.then(({ candidates, truncated }) => {
				dispatch(
					setSearchCandidates({
						scope: subscriptionScope,
						cache: { userId, candidates, truncated, fetchedAt: Date.now() },
					}),
				);
			})
			.catch((error: unknown) => {
				logError(error, {
					operation: 'hooks.useStatementSearch.fetchCandidates',
					userId,
					metadata: { scope: subscriptionScope },
				});
				if (mounted.current) setCandidateError(true);
			})
			.finally(() => {
				fetching.current.delete(subscriptionScope);
				if (mounted.current) setFetchingScope(null);
			});
	}, [active, subscriptionScope, userId, cache, dispatch]);

	// ── Tree: load it whole, or leave it to the server ─────────────────────
	const [treeDecision, setTreeDecision] = useState<{ rootId: string; mode: TreeMode } | null>(null);
	const [loadingTreeId, setLoadingTreeId] = useState<string | null>(null);
	const preparedTree = useRef<string | null>(null);

	const treeMode: TreeMode = !rootId
		? 'pending'
		: fullyLoaded
			? 'local'
			: treeDecision?.rootId === rootId
				? treeDecision.mode
				: 'pending';

	useEffect(() => {
		if (!active || !rootId || fullyLoaded || preparedTree.current === rootId) return;
		preparedTree.current = rootId;

		(async () => {
			try {
				const total = await getStatementsCount(rootId, 'descendants');
				if (total > SEARCH.SERVER_TREE_THRESHOLD) {
					if (mounted.current) setTreeDecision({ rootId, mode: 'server' });

					return;
				}

				if (mounted.current) {
					setTreeDecision({ rootId, mode: 'local' });
					setLoadingTreeId(rootId);
				}
				const { watermark } = await bulkLoadStatements(rootId, 'descendants');
				dispatch(setScopeFullyLoaded({ rootId, mode: 'descendants', watermark }));
			} catch (error) {
				logError(error, { operation: 'hooks.useStatementSearch.prepareTree', statementId: rootId });
				// What is loaded is still searchable; the server covers the rest.
				if (mounted.current) setTreeDecision({ rootId, mode: 'server' });
			} finally {
				if (mounted.current) setLoadingTreeId((current) => (current === rootId ? null : current));
			}
		})();
	}, [active, rootId, fullyLoaded, dispatch]);

	// ── Local ranking ───────────────────────────────────────────────────────
	const candidates = useMemo<SearchCandidate[]>(() => {
		if (!active || !stableScope) return [];

		if (stableScope.kind === 'tree') {
			const treeRoot = stableScope.rootId;

			return statements
				.filter(
					(statement) =>
						statement.statementId === treeRoot ||
						statement.topParentId === treeRoot ||
						statement.parents?.includes(treeRoot),
				)
				.map((statement) => statementToSearchCandidate(statement))
				.filter(isSearchCandidate);
		}

		const byId = new Map<string, SearchCandidate>(
			(cache?.candidates ?? []).map((candidate) => [candidate.statementId, candidate]),
		);
		// Live subscriptions are newer than the download — they win.
		subscriptions
			.filter((subscription) => subscription.userId === userId)
			.map((subscription) => subscriptionToSearchCandidate(subscription))
			.filter(isSearchCandidate)
			.filter((candidate) => stableScope.kind !== 'home' || isTopLevelSearchCandidate(candidate))
			.forEach((candidate) => byId.set(candidate.statementId, candidate));

		return [...byId.values()];
	}, [active, stableScope, statements, subscriptions, cache, userId]);

	const serverRanksLexical = rootId !== undefined && treeMode === 'server';

	const localLexical = useMemo(
		() => (active && !serverRanksLexical ? rankCandidates(debounced, candidates) : []),
		[active, serverRanksLexical, debounced, candidates],
	);

	// ── Server: semantic hits, big trees, truncated subscription downloads ──
	const needsServer =
		active &&
		(rootId !== undefined
			? treeMode !== 'pending' && (wantsMeaning || serverRanksLexical)
			: cache?.truncated === true);
	const requestKey = `${scopeKey}|${debounced}|${serverRanksLexical ? 'lexical' : 'local'}`;
	const [server, setServer] = useState<ServerResult | null>(null);

	useEffect(() => {
		if (!needsServer || !stableScope) return;

		let cancelled = false;
		const isTree = stableScope.kind === 'tree';
		const timer = setTimeout(
			async () => {
				setServer({ key: requestKey, response: null, loading: true, error: false });
				try {
					const response = await searchStatementsOnServer({
						scope: stableScope,
						query: debounced,
						lexical: isTree ? serverRanksLexical : true,
						semantic: isTree && wantsMeaning,
					});
					if (!cancelled) setServer({ key: requestKey, response, loading: false, error: false });
				} catch (error) {
					logError(error, {
						operation: 'hooks.useStatementSearch.searchOnServer',
						userId,
						statementId: rootId,
						metadata: { scope: stableScope.kind, queryLength: debounced.length },
					});
					if (!cancelled)
						setServer({ key: requestKey, response: null, loading: false, error: true });
				}
			},
			Math.max(0, SEARCH.SERVER_DEBOUNCE_MS - SEARCH.DEBOUNCE_MS),
		);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [
		needsServer,
		requestKey,
		stableScope,
		debounced,
		serverRanksLexical,
		wantsMeaning,
		userId,
		rootId,
	]);

	if (!active) return { ...EMPTY_STATE, query: debounced };

	const current = needsServer && server?.key === requestKey ? server : null;
	const serverPending = needsServer && (current === null || current.loading);

	const lexical = serverRanksLexical
		? (current?.response?.lexical ?? [])
		: mergeLexical(localLexical, current?.response?.lexical);
	const lexicalIds = new Set(lexical.map((match) => match.candidate.statementId));
	const semantic = (current?.response?.semantic ?? []).filter(
		(match) => !lexicalIds.has(match.candidate.statementId),
	);

	const waitingForCandidates =
		subscriptionScope !== undefined && cache === undefined && fetchingScope === subscriptionScope;
	const waitingForTree =
		rootId !== undefined && (treeMode === 'pending' || (serverRanksLexical && serverPending));

	return {
		query: debounced,
		lexical,
		semantic,
		isLoading: lexical.length === 0 && (waitingForCandidates || waitingForTree),
		isLoadingTree: rootId !== undefined && loadingTreeId === rootId,
		isSearchingMeaning: wantsMeaning && serverPending,
		coverage: serverRanksLexical ? (current?.response?.coverage ?? null) : null,
		hasError: candidateError || current?.error === true,
	};
}
