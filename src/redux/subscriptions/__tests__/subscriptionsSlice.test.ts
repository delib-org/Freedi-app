/**
 * Tests for subscriptionsSlice Redux store
 */

interface MockWaitingMember {
	statementsSubscribeId: string;
	statementId: string;
	adminId: string;
	displayName: string;
}

// Use require to get the module and work around export naming issues
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sliceModule = require('../subscriptionsSlice');

// Get the slice from the named export (statementsSlicer) or iterate to find it
const sliceExport = Object.values(sliceModule).find(
	(val: unknown) =>
		val !== null && typeof val === 'object' && 'reducer' in (val as Record<string, unknown>),
) as
	| {
			reducer: (...args: unknown[]) => unknown;
			getInitialState: () => { waitingList: MockWaitingMember[] };
	  }
	| undefined;

const {
	setWaitingMember,
	removeWaitingMember,
	clearWaitingMember,
	selectWaitingMember,
	selectWaitingMemberByStatementId,
} = sliceModule;

describe('subscriptionsSlice', () => {
	const mockMember1: MockWaitingMember = {
		statementsSubscribeId: 'sub-1',
		statementId: 'stmt-1',
		adminId: 'admin-1',
		displayName: 'User A',
	};

	const mockMember2: MockWaitingMember = {
		statementsSubscribeId: 'sub-2',
		statementId: 'stmt-1',
		adminId: 'admin-1',
		displayName: 'User B',
	};

	const mockMember3: MockWaitingMember = {
		statementsSubscribeId: 'sub-3',
		statementId: 'stmt-2',
		adminId: 'admin-2',
		displayName: 'User C',
	};

	// Manually define initial state matching the slice definition
	const initialState = { waitingList: [] as MockWaitingMember[] };

	// Get the reducer from the slice or use the one extracted from the module
	const reducer = sliceExport?.reducer ?? sliceModule.default?.reducer;

	it('should have a valid reducer', () => {
		expect(reducer).toBeDefined();
	});

	describe('reducers', () => {
		describe('setWaitingMember', () => {
			it('should add a new waiting member', () => {
				const newState = reducer(initialState, setWaitingMember(mockMember1));
				expect(newState.waitingList).toHaveLength(1);
				expect(newState.waitingList[0].statementsSubscribeId).toBe('sub-1');
			});

			it('should update an existing waiting member', () => {
				const stateWithMember = {
					...initialState,
					waitingList: [mockMember1],
				};
				const updatedMember = { ...mockMember1, displayName: 'Updated User A' };
				const newState = reducer(stateWithMember, setWaitingMember(updatedMember));
				expect(newState.waitingList).toHaveLength(1);
				expect(newState.waitingList[0].displayName).toBe('Updated User A');
			});

			it('should add multiple different members', () => {
				let state = initialState;
				state = reducer(state, setWaitingMember(mockMember1));
				state = reducer(state, setWaitingMember(mockMember2));
				expect(state.waitingList).toHaveLength(2);
			});
		});

		describe('removeWaitingMember', () => {
			it('should remove a waiting member by subscription ID', () => {
				const stateWithMembers = {
					...initialState,
					waitingList: [mockMember1, mockMember2],
				};
				const newState = reducer(stateWithMembers, removeWaitingMember('sub-1'));
				expect(newState.waitingList).toHaveLength(1);
				expect(newState.waitingList[0].statementsSubscribeId).toBe('sub-2');
			});

			it('should do nothing if subscription ID not found', () => {
				const stateWithMembers = {
					...initialState,
					waitingList: [mockMember1],
				};
				const newState = reducer(stateWithMembers, removeWaitingMember('non-existent'));
				expect(newState.waitingList).toHaveLength(1);
			});
		});

		describe('clearWaitingMember', () => {
			it('should clear all waiting members', () => {
				const stateWithMembers = {
					...initialState,
					waitingList: [mockMember1, mockMember2, mockMember3],
				};
				const newState = reducer(stateWithMembers, clearWaitingMember());
				expect(newState.waitingList).toHaveLength(0);
			});

			it('should do nothing on empty state', () => {
				const newState = reducer(initialState, clearWaitingMember());
				expect(newState.waitingList).toHaveLength(0);
			});
		});
	});

	describe('selectors', () => {
		describe('selectWaitingMember', () => {
			it('should return waiting members for the current creator', () => {
				const mockState = {
					subscriptions: {
						waitingList: [mockMember1, mockMember2, mockMember3],
					},
					creator: { creator: { uid: 'admin-1' } },
				};
				const result = selectWaitingMember(mockState);
				expect(result).toHaveLength(2);
				expect(result.every((m: MockWaitingMember) => m.adminId === 'admin-1')).toBe(true);
			});

			it('should return empty array when creator is null', () => {
				const mockState = {
					subscriptions: {
						waitingList: [mockMember1],
					},
					creator: { creator: null },
				};
				const result = selectWaitingMember(mockState);
				expect(result).toHaveLength(0);
			});
		});

		describe('selectWaitingMemberByStatementId', () => {
			it('should return waiting members for a specific statement', () => {
				const mockState = {
					subscriptions: {
						waitingList: [mockMember1, mockMember2, mockMember3],
					},
					creator: { creator: { uid: 'admin-1' } },
				};
				const selector = selectWaitingMemberByStatementId('stmt-1');
				const result = selector(mockState);
				expect(result).toHaveLength(2);
				expect(result.every((m: MockWaitingMember) => m.statementId === 'stmt-1')).toBe(true);
			});

			it('should return empty array for non-existent statement', () => {
				const mockState = {
					subscriptions: {
						waitingList: [mockMember1],
					},
					creator: { creator: { uid: 'admin-1' } },
				};
				const selector = selectWaitingMemberByStatementId('non-existent');
				const result = selector(mockState);
				expect(result).toHaveLength(0);
			});
		});
	});
});
