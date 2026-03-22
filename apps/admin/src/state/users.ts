import m from 'mithril';
import { listenToUsers, fetchUsers, fetchUserCount, UserDoc } from '../lib/queries';
import type { Unsubscribe, QueryDocumentSnapshot } from '../lib/queries';

interface UsersState {
	items: UserDoc[];
	totalUsers: number;
	loading: boolean;
	loadingMore: boolean;
	error: string | null;
	cursor: QueryDocumentSnapshot | null;
	hasMore: boolean;
}

const PAGE_SIZE = 25;

const state: UsersState = {
	items: [],
	totalUsers: 0,
	loading: false,
	loadingMore: false,
	error: null,
	cursor: null,
	hasMore: false,
};

let unsub: Unsubscribe | null = null;

export function subscribeUsers(): void {
	if (unsub) unsub();

	state.loading = true;
	state.error = null;
	m.redraw();

	// Count (one-time)
	fetchUserCount()
		.then((count) => { state.totalUsers = count; m.redraw(); })
		.catch((e) => console.error('[Users] count error:', e));

	// Real-time list
	unsub = listenToUsers(PAGE_SIZE + 1, (snap) => {
		const hasMore = snap.docs.length > PAGE_SIZE;
		const docs = hasMore ? snap.docs.slice(0, PAGE_SIZE) : snap.docs;

		state.items = docs.map((d) => ({ uid: d.id, ...d.data() } as UserDoc));
		state.cursor = docs.length > 0 ? docs[docs.length - 1] : null;
		state.hasMore = hasMore;
		state.loading = false;
		state.error = null;
		m.redraw();
	});
}

export function unsubscribeUsers(): void {
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
		const result = await fetchUsers(state.cursor, PAGE_SIZE);
		state.items = [...state.items, ...result.items];
		state.cursor = result.lastDoc;
		state.hasMore = result.hasMore;
		state.loadingMore = false;
	} catch (error) {
		console.error('[Users] Failed to load next page:', error);
		state.loadingMore = false;
	}

	m.redraw();
}

export function getUsersState(): Readonly<UsersState> {
	return state;
}
