import m from 'mithril';
import { Statement } from '@freedi/shared-types';
import {
	listenToStatements,
	fetchStatements,
	StatementsFilter,
} from '../lib/queries';
import type { Unsubscribe, QueryDocumentSnapshot } from '../lib/queries';

interface StatementsState {
	items: Statement[];
	loading: boolean;
	loadingMore: boolean;
	error: string | null;
	cursor: QueryDocumentSnapshot | null;
	hasMore: boolean;
	filter: StatementsFilter;
}

const PAGE_SIZE = 25;

const state: StatementsState = {
	items: [],
	loading: false,
	loadingMore: false,
	error: null,
	cursor: null,
	hasMore: false,
	filter: {},
};

let unsub: Unsubscribe | null = null;

function startListener(): void {
	// Clean up previous listener
	if (unsub) unsub();

	state.loading = true;
	state.items = [];
	state.cursor = null;
	state.hasMore = false;
	state.error = null;
	m.redraw();

	unsub = listenToStatements(state.filter, PAGE_SIZE + 1, (snap) => {
		const hasMore = snap.docs.length > PAGE_SIZE;
		const docs = hasMore ? snap.docs.slice(0, PAGE_SIZE) : snap.docs;

		state.items = docs.map((d) => d.data() as Statement);
		state.cursor = docs.length > 0 ? docs[docs.length - 1] : null;
		state.hasMore = hasMore;
		state.loading = false;
		state.error = null;
		m.redraw();
	});
}

export function subscribeStatements(): void {
	startListener();
}

export function unsubscribeStatements(): void {
	if (unsub) {
		unsub();
		unsub = null;
	}
}

export async function loadNextPage(): Promise<void> {
	if (!state.hasMore || state.loadingMore || !state.cursor) return;

	state.loadingMore = true;
	m.redraw();

	try {
		const result = await fetchStatements(state.filter, state.cursor, PAGE_SIZE);
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
	startListener();
}

export function getStatementsState(): Readonly<StatementsState> {
	return state;
}
