import { Role, StatementSubscription, StatementType, UserFeedItem } from '@freedi/shared-types';
import {
	statementsSlice,
	statementsSubscriptionsSelector,
	topSubscriptionsSelector,
} from '@/redux/statements/statementsSlice';
import { upsertUserFeedItems, userFeedSlice } from '../userFeedSlice';

function subscription(statementId: string, lastUpdate: number): StatementSubscription {
	return {
		statementsSubscribeId: `alice--${statementId}`,
		userId: 'alice',
		statementId,
		role: Role.member,
		parentId: 'top',
		statementType: StatementType.group,
		lastUpdate,
		user: { uid: 'alice', displayName: 'Alice' },
		statement: {
			statementId,
			statement: statementId,
			statementType: StatementType.group,
			creatorId: 'owner',
			creator: { uid: 'owner', displayName: 'Owner' },
			parentId: 'top',
			consensus: 0,
		},
	} as StatementSubscription;
}

function feed(statementId: string, lastActivity: number): UserFeedItem {
	return {
		feedId: `alice--${statementId}`,
		userId: 'alice',
		statementId,
		subscriptionId: `alice--${statementId}`,
		lastActivity,
		createdAt: 1,
	};
}

function buildState(subscriptions: StatementSubscription[], items: UserFeedItem[]) {
	const statementsInit = statementsSlice.reducer(undefined, { type: '@@init' });

	return {
		statements: { ...statementsInit, statementSubscription: subscriptions },
		userFeed: userFeedSlice.reducer(undefined, upsertUserFeedItems(items)),
	};
}

describe('home ordering with userFeed activity', () => {
	// Phase 2: subscription lastUpdate no longer moves on activity — only the feed does.
	const subscriptions = [
		subscription('old', 100),
		subscription('mid', 200),
		subscription('new', 300),
	];

	it('orders topics by the feed lastActivity, not the stale subscription lastUpdate', () => {
		const state = buildState(subscriptions, [feed('old', 900), feed('mid', 200), feed('new', 300)]);

		expect(topSubscriptionsSelector(state).map((sub) => sub.statementId)).toEqual([
			'old',
			'new',
			'mid',
		]);
		expect(statementsSubscriptionsSelector(state)[0].statementId).toBe('old');
	});

	it('falls back to subscription lastUpdate when there is no feed entry (not yet backfilled)', () => {
		const state = buildState(subscriptions, []);

		expect(topSubscriptionsSelector(state).map((sub) => sub.statementId)).toEqual([
			'new',
			'mid',
			'old',
		]);
	});
});
