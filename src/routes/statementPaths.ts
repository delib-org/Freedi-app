/**
 * Statement links for the current ThinkingSpace shell.
 * Tab views use /statement/:id?tab=..., screen views use
 * /statement-screen/:id/:screen. Links from feat/ux-overhaul's
 * /statement/:id/:view family are accepted and mapped to these routes.
 */
import { Screen, SortType } from '@freedi/shared-types';

/** A view of one question. Tab views share the question header; screen views replace it. */
export type StatementView =
	| 'overview'
	| 'themes'
	| 'covenant'
	| 'summary'
	| 'maps'
	| 'cluster-board'
	| 'chat'
	| 'options'
	| 'questions'
	| 'results'
	| 'agreement'
	| 'vote'
	| 'settings'
	| 'mind-map'
	| 'agreement-map'
	| 'polarization-index'
	| 'sub-questions-map'
	| 'research';

/** Views rendered inside the question shell, selectable from the segmented control. */
export const TAB_VIEWS = ['chat', 'options', 'questions'] as const;
export type StatementTabView = (typeof TAB_VIEWS)[number];

/** Views that take over the whole page (no segmented control, no brief). */
export const SCREEN_VIEWS = [
	'settings',
	'mind-map',
	'agreement-map',
	'polarization-index',
	'sub-questions-map',
	'research',
] as const;

export const STATEMENT_VIEWS: readonly StatementView[] = [
	'overview',
	'themes',
	'covenant',
	'summary',
	'maps',
	'cluster-board',
	...TAB_VIEWS,
	'results',
	'agreement',
	'vote',
	...SCREEN_VIEWS,
];

/** `Screen` enum members that are also URL views (the rest — team, doc, home, statement — are not routes). */
export const SCREEN_ENUM_VIEWS: readonly Screen[] = [
	Screen.chat,
	Screen.options,
	Screen.questions,
	Screen.settings,
	Screen.mindMap,
	Screen.agreementMap,
	Screen.polarizationIndex,
	Screen.subQuestionsMap,
	Screen.research,
];

/** Path prefixes that belong to a statement page (canonical and legacy). */
export const STATEMENT_PATH_PREFIXES = ['/statement/', '/stage/', '/statement-screen/'] as const;

const LEGACY_FAMILIES = new Set(['statement', 'stage', 'statement-screen']);
/** Third segments under `/statement/:id/` that are separate pages, not views. */
const RESERVED_SEGMENTS = new Set(['thank-you', 'groups']);
const MAIN_ALIAS = 'main';
const ADD_OPTION_ALIAS = 'addOption';
const SORT_PARAM = 'sort';
const TAB_PARAM = 'tab';
const ADD_PARAM = 'add';

const SORT_VALUES = new Set<string>(Object.values(SortType));
const VIEW_VALUES = new Set<string>(STATEMENT_VIEWS);
const TAB_VALUES = new Set<string>(TAB_VIEWS);
const SCREEN_VALUES = new Set<string>(SCREEN_VIEWS);

export function isStatementView(value: unknown): value is StatementView {
	return typeof value === 'string' && VIEW_VALUES.has(value);
}

export function isTabView(value: unknown): value is StatementTabView {
	return typeof value === 'string' && TAB_VALUES.has(value);
}

/** True for the full-page views (settings, maps, research). */
export function isScreenView(value: unknown): boolean {
	return typeof value === 'string' && SCREEN_VALUES.has(value);
}

export function isSortType(value: unknown): value is SortType {
	return typeof value === 'string' && SORT_VALUES.has(value);
}

/**
 * The tab the segmented control should highlight for a view.
 * `vote` lives on the answers list; screen views and `results` fall back to the
 * question's default tab (what the header showed before the user opened a map).
 */
export function resolveTabView(
	view: StatementView | undefined,
	defaultView: string | undefined,
): StatementTabView {
	if (isTabView(view)) return view;
	if (view === 'vote') return 'options';

	return isTabView(defaultView) ? defaultView : 'chat';
}

export interface StatementPathParts {
	statementId: string;
	view?: StatementView;
	sort?: SortType;
	/** Extra query params, kept in insertion order. `tab` is never emitted. */
	query?: Record<string, string> | URLSearchParams;
}

export interface ParsedStatementPath {
	statementId: string;
	view: StatementView | undefined;
	sort: SortType | undefined;
	/** Query params other than `sort` (and the retired `tab`), in original order. */
	rest: URLSearchParams;
}

function toSearchParams(query: StatementPathParts['query']): URLSearchParams {
	if (!query) return new URLSearchParams();
	if (query instanceof URLSearchParams) return new URLSearchParams(query);

	return new URLSearchParams(query);
}

function joinPath(
	statementId: string,
	view: StatementView | undefined,
	params: URLSearchParams,
): string {
	const isScreen = view && (isScreenView(view) || view === 'cluster-board');
	const tab = view === 'agreement' ? 'covenant' : view === 'results' ? 'summary' : view;
	if (tab && !isScreen) params.set('tab', tab);
	const search = params.toString();
	const path = isScreen ? `/statement-screen/${statementId}/${view}` : `/statement/${statementId}`;

	return `${path}${search ? `?${search}` : ''}`;
}

/** Build a canonical statement URL. */
export function buildStatementPath({ statementId, view, sort, query }: StatementPathParts): string {
	const params = toSearchParams(query);
	params.delete(TAB_PARAM);
	if (sort) {
		params.set(SORT_PARAM, sort);
	}

	return joinPath(statementId, view, params);
}

/**
 * Split `pathname?search` (or `#/pathname?search`) into its two halves,
 * tolerating a leading hash route and trailing slashes.
 */
function splitPathAndSearch(input: string): { pathname: string; search: string } {
	let value = input.trim();
	if (value.startsWith('#')) value = value.slice(1);
	const hashIndex = value.indexOf('#');
	if (hashIndex !== -1) value = value.slice(0, hashIndex);

	const queryIndex = value.indexOf('?');
	const rawPath = queryIndex === -1 ? value : value.slice(0, queryIndex);
	const search = queryIndex === -1 ? '' : value.slice(queryIndex);
	const pathname = rawPath.replace(/\/+$/, '') || '/';

	return { pathname, search };
}

interface LegacyResolution {
	statementId: string;
	view: StatementView | undefined;
	params: URLSearchParams;
}

/**
 * Resolve any statement URL (legacy or canonical) into its parts.
 * Returns null when the input is not a statement page (thank-you, groups,
 * map, events, my-suggestions, or anything else).
 */
function resolve(pathnameWithSearch: string): LegacyResolution | null {
	const { pathname, search } = splitPathAndSearch(pathnameWithSearch);
	const segments = pathname.split('/').filter(Boolean);
	const [family, statementId, third, ...extra] = segments;

	if (!family || !LEGACY_FAMILIES.has(family) || !statementId || extra.length > 0) return null;
	if (family === 'statement' && third && RESERVED_SEGMENTS.has(third)) return null;

	const params = new URLSearchParams(search);
	let view: StatementView | undefined;

	if (family === 'stage') {
		view = 'options';
		if (isSortType(third) && !params.has(SORT_PARAM)) params.set(SORT_PARAM, third);
	} else if (third === ADD_OPTION_ALIAS) {
		view = 'options';
		if (!params.has(ADD_PARAM)) params.set(ADD_PARAM, '1');
	} else if (isSortType(third)) {
		view = 'options';
		if (!params.has(SORT_PARAM)) params.set(SORT_PARAM, third);
	} else if (isStatementView(third)) {
		view = third;
	} else if (third && third !== MAIN_ALIAS) {
		// Unknown segment — the old `:sort` route swallowed anything; fall back
		// to the question's default view rather than 404.
		view = undefined;
	}

	const tab = params.get(TAB_PARAM);
	if (!view && isStatementView(tab)) view = tab;
	params.delete(TAB_PARAM);

	const sort = params.get(SORT_PARAM);
	if (sort !== null && !isSortType(sort)) params.delete(SORT_PARAM);

	return { statementId, view, params };
}

/**
 * Map any statement URL onto the canonical family. Idempotent. Unknown query
 * params survive in their original order. Returns null for non-statement URLs.
 */
export function canonicalizeStatementPath(pathnameWithSearch: string): string | null {
	const resolved = resolve(pathnameWithSearch);
	if (!resolved) return null;

	return joinPath(resolved.statementId, resolved.view, resolved.params);
}

/** Parse a statement URL (legacy or canonical) into its parts, or null. */
export function parseStatementPath(pathname: string, search = ''): ParsedStatementPath | null {
	const resolved = resolve(`${pathname}${search}`);
	if (!resolved) return null;

	const rest = new URLSearchParams(resolved.params);
	const sortValue = rest.get(SORT_PARAM);
	rest.delete(SORT_PARAM);

	return {
		statementId: resolved.statementId,
		view: resolved.view,
		sort: isSortType(sortValue) ? sortValue : undefined,
		rest,
	};
}

/** True when the path is already in the canonical family (or is not a statement URL at all). */
export function isCanonicalStatementPath(pathnameWithSearch: string): boolean {
	const canonical = canonicalizeStatementPath(pathnameWithSearch);

	return canonical === null || canonical === pathnameWithSearch;
}

/** Compare two stored/current statement paths regardless of which family they were written in. */
export function isSameStatementPath(a: string | undefined, b: string | undefined): boolean {
	if (!a || !b) return a === b;

	return (canonicalizeStatementPath(a) ?? a) === (canonicalizeStatementPath(b) ?? b);
}
