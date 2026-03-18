import m from 'mithril';
import { Statement, StatementType } from '@freedi/shared-types';
import { fetchStatements, StatementsFilter } from '../lib/queries';
import type { QueryDocumentSnapshot } from '../lib/firebase';

interface StatementsState {
	items: Statement[];
	loading: boolean;
	loadingMore: boolean;
	error: string | null;
	cursor: QueryDocumentSnapshot | null;
	hasMore: boolean;
	filter: StatementsFilter;
}

const state: StatementsState = {
	items: [],
	loading: false,
	loadingMore: false,
	error: null,
	cursor: null,
	hasMore: false,
	filter: {},
};

export async function loadStatements(): Promise<void> {
	state.loading = true;
	state.error = null;
	state.items = [];
	state.cursor = null;
	m.redraw();

	try {
		const result = await fetchStatements(state.filter, null);
		state.items = result.items;
		state.cursor = result.lastDoc;
		state.hasMore = result.hasMore;
		state.loading = false;
	} catch (error) {
		console.error('[Statements] Failed to load:', error);
		state.error = 'Failed to load statements';
		state.loading = false;
	}

	m.redraw();
}

export async function loadNextPage(): Promise<void> {
	if (!state.hasMore || state.loadingMore) return;

	state.loadingMore = true;
	m.redraw();

	try {
		const result = await fetchStatements(state.filter, state.cursor);
		state.items = [...state.items, ...result.items];
		state.cursor = result.lastDoc;
		state.hasMore = result.hasMore;
		state.loadingMore = false;
	} catch (error) {
		console.error('[Statements] Failed to load next page:', error);
		state.loadingMore = false;
	}

	m.redraw();
}

export function setFilter(filter: Partial<StatementsFilter>): void {
	state.filter = { ...state.filter, ...filter };
	loadStatements();
}

export function getStatementsState(): Readonly<StatementsState> {
	return state;
}
