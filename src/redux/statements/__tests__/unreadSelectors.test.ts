import { Statement, StatementSubscription } from '@freedi/shared-types';
import {
	statementsSlice,
	setStatement,
	setStatementSubscription,
	setStatementMessageCounts,
	setSeenMessageCounts,
} from '../statementsSlice';
import { unreadMessagesSelector } from '../unreadSelectors';

jest.mock('@/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

type StatementsRoot = Parameters<ReturnType<typeof unreadMessagesSelector>>[0];

function build(
	statement: Partial<Statement> | undefined,
	subscription?: Partial<StatementSubscription>,
	seen?: number,
	fetched?: number,
): StatementsRoot {
	let state = statementsSlice.reducer(undefined, { type: 'init' });
	if (statement) {
		state = statementsSlice.reducer(
			state,
			setStatement({ statementId: 'q1', statement: 'Q', ...statement } as Statement),
		);
	}
	if (subscription) {
		state = statementsSlice.reducer(
			state,
			setStatementSubscription({
				statementId: 'q1',
				statementsSubscribeId: 'u--q1',
				lastUpdate: 1,
				...subscription,
			} as StatementSubscription),
		);
	}
	if (seen !== undefined) {
		state = statementsSlice.reducer(
			state,
			setSeenMessageCounts([{ statementId: 'q1', seenMessageCount: seen }]),
		);
	}
	if (fetched !== undefined) {
		state = statementsSlice.reducer(
			state,
			setStatementMessageCounts([{ statementId: 'q1', count: fetched }]),
		);
	}

	return { statements: state };
}

describe('unreadMessagesSelector', () => {
	it('is counter minus the subscription marker', () => {
		const state = build({ descendantMessageCount: 10 }, { seenMessageCount: 6 });
		expect(unreadMessagesSelector('q1')(state)).toBe(4);
	});

	it('is 0 without any subscription (never opened)', () => {
		expect(unreadMessagesSelector('q1')(build({ descendantMessageCount: 10 }))).toBe(0);
	});

	it('counts a subscription with no marker as 0 seen', () => {
		expect(unreadMessagesSelector('q1')(build({ descendantMessageCount: 3 }, {}))).toBe(3);
	});

	it('uses the fetched marker map for cards whose subscription is not in the store', () => {
		const state = build({ descendantMessageCount: 5 }, undefined, 2);
		expect(unreadMessagesSelector('q1')(state)).toBe(3);
	});

	it('takes the larger marker when both exist', () => {
		const state = build({ descendantMessageCount: 9 }, { seenMessageCount: 4 }, 7);
		expect(unreadMessagesSelector('q1')(state)).toBe(2);
	});

	it('reads the Home-fetched counter when the statement is not in the store', () => {
		const state = build(undefined, { seenMessageCount: 1 }, undefined, 6);
		expect(unreadMessagesSelector('q1')(state)).toBe(5);
	});

	it('is 0 for an unknown statement and for no id', () => {
		const state = build({ descendantMessageCount: 4 }, {});
		expect(unreadMessagesSelector('nope')(state)).toBe(0);
		expect(unreadMessagesSelector(undefined)(state)).toBe(0);
	});
});

describe('message counter reducers', () => {
	it('setStatementMessageCounts updates the loaded statement in place', () => {
		const state = build({ descendantMessageCount: 1 }, {});
		const next = statementsSlice.reducer(
			state.statements,
			setStatementMessageCounts([{ statementId: 'q1', count: 8 }]),
		);
		expect(next.statements[0].descendantMessageCount).toBe(8);
		expect(next.fetchedMessageCounts.q1).toBe(8);
	});

	it('setSeenMessageCounts never lowers a marker', () => {
		let state = statementsSlice.reducer(
			undefined,
			setSeenMessageCounts([{ statementId: 'q1', seenMessageCount: 9 }]),
		);
		state = statementsSlice.reducer(
			state,
			setSeenMessageCounts([{ statementId: 'q1', seenMessageCount: 4 }]),
		);
		expect(state.seenMessageCounts.q1).toBe(9);
	});
});
