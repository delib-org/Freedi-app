import type { UserFeedItem } from '@freedi/shared-types';
import {
	removeUserFeedItem,
	resetUserFeed,
	selectOldestUserFeedActivity,
	selectUserFeedActivity,
	upsertUserFeedItems,
	userFeedSlice,
	type UserFeedState,
} from '../userFeedSlice';

const reducer = userFeedSlice.reducer;
const initial = (): UserFeedState => reducer(undefined, { type: '@@init' });

function item(statementId: string, lastActivity: number, userId = 'alice'): UserFeedItem {
	return {
		feedId: `${userId}--${statementId}`,
		userId,
		statementId,
		subscriptionId: `${userId}--${statementId}`,
		lastActivity,
		createdAt: 1,
	};
}

describe('userFeedSlice', () => {
	it('upserts entries by statementId', () => {
		const state = reducer(initial(), upsertUserFeedItems([item('a', 10), item('b', 20)]));

		expect(state.lastActivityById).toEqual({ a: 10, b: 20 });
		expect(state.userId).toBe('alice');
	});

	it('never lets an older value overwrite a newer one (a late page cannot move an item back)', () => {
		let state = reducer(initial(), upsertUserFeedItems([item('a', 50)]));
		state = reducer(state, upsertUserFeedItems([item('a', 10)]));

		expect(state.lastActivityById.a).toBe(50);
	});

	it('drops the previous user entries when another user signs in', () => {
		let state = reducer(initial(), upsertUserFeedItems([item('a', 10)]));
		state = reducer(state, upsertUserFeedItems([item('b', 5, 'bob')]));

		expect(state.lastActivityById).toEqual({ b: 5 });
	});

	it('removes and resets', () => {
		let state = reducer(initial(), upsertUserFeedItems([item('a', 10), item('b', 20)]));
		state = reducer(state, removeUserFeedItem('a'));
		expect(state.lastActivityById).toEqual({ b: 20 });

		state = reducer(state, resetUserFeed());
		expect(state).toEqual(initial());
	});

	describe('selectors', () => {
		it('returns the oldest loaded activity as the topics cursor', () => {
			const userFeed = reducer(
				initial(),
				upsertUserFeedItems([item('a', 30), item('b', 10), item('c', 20)]),
			);

			expect(selectOldestUserFeedActivity({ userFeed })).toBe(10);
		});

		it('tolerates a store without the slice', () => {
			expect(selectUserFeedActivity({})).toEqual({});
			expect(selectOldestUserFeedActivity({})).toBeNull();
		});
	});
});
