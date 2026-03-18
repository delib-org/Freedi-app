import m from 'mithril';
import { fetchUsers, fetchUserCount, UserDoc } from '../lib/queries';
import type { QueryDocumentSnapshot } from '../lib/firebase';

interface UsersState {
	items: UserDoc[];
	totalUsers: number;
	loading: boolean;
	loadingMore: boolean;
	error: string | null;
	cursor: QueryDocumentSnapshot | null;
	hasMore: boolean;
}

const state: UsersState = {
	items: [],
	totalUsers: 0,
	loading: false,
	loadingMore: false,
	error: null,
	cursor: null,
	hasMore: false,
};

export async function loadUsers(): Promise<void> {
	state.loading = true;
	state.error = null;
	state.items = [];
	state.cursor = null;
	m.redraw();

	try {
		const [result, count] = await Promise.all([
			fetchUsers(null),
			fetchUserCount(),
		]);

		state.items = result.items;
		state.cursor = result.lastDoc;
		state.hasMore = result.hasMore;
		state.totalUsers = count;
		state.loading = false;
	} catch (error) {
		console.error('[Users] Failed to load:', error);
		state.error = 'Failed to load users';
		state.loading = false;
	}

	m.redraw();
}

export async function loadNextPage(): Promise<void> {
	if (!state.hasMore || state.loadingMore) return;

	state.loadingMore = true;
	m.redraw();

	try {
		const result = await fetchUsers(state.cursor);
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
