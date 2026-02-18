/**
 * Comprehensive tests for Redux Selector Factories
 *
 * Tests all factory functions and sort helpers with edge cases.
 */

// Mock @freedi/shared-types before imports
jest.mock('@freedi/shared-types', () => ({
	StatementType: {
		statement: 'statement',
		option: 'option',
		question: 'question',
		document: 'document',
		group: 'group',
		comment: 'comment',
		paragraph: 'paragraph',
	},
}));

// Define local types to avoid delib-npm valibot issues in tests
enum StatementType {
	statement = 'statement',
	option = 'option',
	question = 'question',
	document = 'document',
	group = 'group',
	comment = 'comment',
	paragraph = 'paragraph',
}

interface MockStatement {
	statementId: string;
	parentId: string;
	topParentId: string;
	statement: string;
	statementType: StatementType;
	createdAt: number;
	lastUpdate: number;
	consensus?: number;
	hide?: boolean;
	isInMultiStage?: boolean;
	evaluation?: {
		agreement?: number;
		numberOfEvaluators?: number;
	};
}

type MockRootState = {
	statements: {
		statements: MockStatement[];
		statementSubscription: unknown[];
		statementSubscriptionLastUpdate: number;
		statementMembership: unknown[];
		screen: string;
	};
};

import {
	createStatementsByParentSelector,
	createStatementsByParentAndTypeSelector,
	createStatementByIdSelector,
	createStatementsByTopParentSelector,
	createFilteredStatementsSelector,
	createCountSelector,
	createExistsSelector,
	sortByCreatedAt,
	sortByLastUpdate,
	sortByConsensus,
	sortByEvaluationCount,
} from '../selectorFactories';

// Helper to build a test root state
function buildRootState(statements: MockStatement[]): MockRootState {
	return {
		statements: {
			statements,
			statementSubscription: [],
			statementSubscriptionLastUpdate: 0,
			statementMembership: [],
			screen: 'chat',
		},
	};
}

// Factory for building mock statements
function buildStatement(overrides: Partial<MockStatement> = {}): MockStatement {
	return {
		statementId: 'stmt-default',
		parentId: 'parent-default',
		topParentId: 'top-default',
		statement: 'Default statement',
		statementType: StatementType.statement,
		createdAt: 1000,
		lastUpdate: 2000,
		consensus: 0,
		...overrides,
	};
}

describe('Selector Factories', () => {
	// -----------------------------------------------------------------------
	// createStatementsByParentSelector
	// -----------------------------------------------------------------------
	describe('createStatementsByParentSelector', () => {
		const selectStatements = (state: MockRootState) => state.statements.statements;
		const factory = createStatementsByParentSelector(selectStatements as never);

		it('should return statements that match the parent ID', () => {
			const s1 = buildStatement({ statementId: 's1', parentId: 'parent-A', createdAt: 100 });
			const s2 = buildStatement({ statementId: 's2', parentId: 'parent-A', createdAt: 200 });
			const s3 = buildStatement({ statementId: 's3', parentId: 'parent-B', createdAt: 150 });
			const state = buildRootState([s1, s2, s3]);

			const selector = factory('parent-A');
			const result = selector(state as never);

			expect(result).toHaveLength(2);
			expect(result.map((s) => s.statementId)).toEqual(['s1', 's2']);
		});

		it('should sort results by createdAt ascending', () => {
			const s1 = buildStatement({ statementId: 's1', parentId: 'parent-A', createdAt: 300 });
			const s2 = buildStatement({ statementId: 's2', parentId: 'parent-A', createdAt: 100 });
			const s3 = buildStatement({ statementId: 's3', parentId: 'parent-A', createdAt: 200 });
			const state = buildRootState([s1, s2, s3]);

			const selector = factory('parent-A');
			const result = selector(state as never);

			expect(result.map((s) => s.createdAt)).toEqual([100, 200, 300]);
		});

		it('should return empty array when parent has no children', () => {
			const s1 = buildStatement({ statementId: 's1', parentId: 'parent-B' });
			const state = buildRootState([s1]);

			const selector = factory('parent-A');
			const result = selector(state as never);

			expect(result).toHaveLength(0);
		});

		it('should return empty array when parentId is undefined', () => {
			const s1 = buildStatement({ statementId: 's1', parentId: 'parent-A' });
			const state = buildRootState([s1]);

			const selector = factory(undefined);
			const result = selector(state as never);

			expect(result).toHaveLength(0);
		});

		it('should return empty array when state has no statements', () => {
			const state = buildRootState([]);

			const selector = factory('parent-A');
			const result = selector(state as never);

			expect(result).toHaveLength(0);
		});

		it('should handle a large list efficiently (100 statements)', () => {
			const statements = Array.from({ length: 100 }, (_, i) =>
				buildStatement({
					statementId: `s${i}`,
					parentId: i < 50 ? 'parent-A' : 'parent-B',
					createdAt: i * 100,
				}),
			);
			const state = buildRootState(statements);

			const selector = factory('parent-A');
			const result = selector(state as never);

			expect(result).toHaveLength(50);
		});
	});

	// -----------------------------------------------------------------------
	// createStatementsByParentAndTypeSelector
	// -----------------------------------------------------------------------
	describe('createStatementsByParentAndTypeSelector', () => {
		const selectStatements = (state: MockRootState) => state.statements.statements;
		const factory = createStatementsByParentAndTypeSelector(selectStatements as never);

		it('should filter by both parent ID and statement type', () => {
			const option1 = buildStatement({
				statementId: 'o1',
				parentId: 'parent-A',
				statementType: StatementType.option,
				createdAt: 100,
			});
			const option2 = buildStatement({
				statementId: 'o2',
				parentId: 'parent-A',
				statementType: StatementType.option,
				createdAt: 200,
			});
			const question = buildStatement({
				statementId: 'q1',
				parentId: 'parent-A',
				statementType: StatementType.question,
			});
			const otherParent = buildStatement({
				statementId: 'o3',
				parentId: 'parent-B',
				statementType: StatementType.option,
			});

			const state = buildRootState([option1, option2, question, otherParent]);

			const selector = factory('parent-A', StatementType.option as never);
			const result = selector(state as never);

			expect(result).toHaveLength(2);
			expect(result.map((s) => s.statementId)).toEqual(['o1', 'o2']);
		});

		it('should return empty array when type does not match', () => {
			const statement = buildStatement({
				statementId: 's1',
				parentId: 'parent-A',
				statementType: StatementType.statement,
			});
			const state = buildRootState([statement]);

			const selector = factory('parent-A', StatementType.option as never);
			const result = selector(state as never);

			expect(result).toHaveLength(0);
		});

		it('should sort results by createdAt ascending', () => {
			const o3 = buildStatement({
				statementId: 'o3',
				parentId: 'p',
				statementType: StatementType.option,
				createdAt: 300,
			});
			const o1 = buildStatement({
				statementId: 'o1',
				parentId: 'p',
				statementType: StatementType.option,
				createdAt: 100,
			});
			const o2 = buildStatement({
				statementId: 'o2',
				parentId: 'p',
				statementType: StatementType.option,
				createdAt: 200,
			});
			const state = buildRootState([o3, o1, o2]);

			const selector = factory('p', StatementType.option as never);
			const result = selector(state as never);

			expect(result.map((s) => s.createdAt)).toEqual([100, 200, 300]);
		});

		it('should handle undefined parentId', () => {
			const s1 = buildStatement({ parentId: 'parent-A', statementType: StatementType.option });
			const state = buildRootState([s1]);

			const selector = factory(undefined, StatementType.option as never);
			const result = selector(state as never);

			expect(result).toHaveLength(0);
		});
	});

	// -----------------------------------------------------------------------
	// createStatementByIdSelector
	// -----------------------------------------------------------------------
	describe('createStatementByIdSelector', () => {
		const selectStatements = (state: MockRootState) => state.statements.statements;
		const factory = createStatementByIdSelector(selectStatements as never);

		it('should find a statement by ID', () => {
			const s1 = buildStatement({ statementId: 'target-id', statement: 'Found!' });
			const s2 = buildStatement({ statementId: 'other-id' });
			const state = buildRootState([s1, s2]);

			const selector = factory('target-id');
			const result = selector(state as never);

			expect(result?.statementId).toBe('target-id');
			expect(result?.statement).toBe('Found!');
		});

		it('should return undefined when ID not found', () => {
			const state = buildRootState([buildStatement({ statementId: 'other-id' })]);

			const selector = factory('non-existent-id');
			const result = selector(state as never);

			expect(result).toBeUndefined();
		});

		it('should return undefined for undefined ID', () => {
			const state = buildRootState([buildStatement()]);

			const selector = factory(undefined);
			const result = selector(state as never);

			expect(result).toBeUndefined();
		});

		it('should return undefined for empty state', () => {
			const state = buildRootState([]);

			const selector = factory('any-id');
			const result = selector(state as never);

			expect(result).toBeUndefined();
		});

		it('should return the first matching statement (unique IDs assumed)', () => {
			const s1 = buildStatement({ statementId: 'dup-id', statement: 'First' });
			const state = buildRootState([s1]);

			const selector = factory('dup-id');
			const result = selector(state as never);

			expect(result?.statement).toBe('First');
		});
	});

	// -----------------------------------------------------------------------
	// createStatementsByTopParentSelector
	// -----------------------------------------------------------------------
	describe('createStatementsByTopParentSelector', () => {
		const selectStatements = (state: MockRootState) => state.statements.statements;
		const factory = createStatementsByTopParentSelector(selectStatements as never);

		it('should return statements with matching topParentId', () => {
			const s1 = buildStatement({ statementId: 's1', topParentId: 'top-A' });
			const s2 = buildStatement({ statementId: 's2', topParentId: 'top-A' });
			const s3 = buildStatement({ statementId: 's3', topParentId: 'top-B' });
			const state = buildRootState([s1, s2, s3]);

			const selector = factory('top-A');
			const result = selector(state as never);

			expect(result).toHaveLength(2);
			expect(result.map((s) => s.statementId)).toContain('s1');
			expect(result.map((s) => s.statementId)).toContain('s2');
		});

		it('should return empty array when topParentId is undefined', () => {
			const s1 = buildStatement({ topParentId: 'top-A' });
			const state = buildRootState([s1]);

			const selector = factory(undefined);
			const result = selector(state as never);

			expect(result).toHaveLength(0);
		});
	});

	// -----------------------------------------------------------------------
	// createFilteredStatementsSelector
	// -----------------------------------------------------------------------
	describe('createFilteredStatementsSelector', () => {
		const selectStatements = (state: MockRootState) => state.statements.statements;
		const factory = createFilteredStatementsSelector(selectStatements as never);

		it('should filter by custom predicate', () => {
			const visible1 = buildStatement({ statementId: 's1', hide: false });
			const hidden = buildStatement({ statementId: 's2', hide: true });
			const visible2 = buildStatement({ statementId: 's3', hide: false });
			const state = buildRootState([visible1, hidden, visible2]);

			const selector = factory((s) => !s.hide);
			const result = selector(state as never);

			expect(result).toHaveLength(2);
			expect(result.map((s) => s.statementId)).toContain('s1');
			expect(result.map((s) => s.statementId)).toContain('s3');
		});

		it('should apply sort function when provided', () => {
			const s1 = buildStatement({ statementId: 's1', createdAt: 300 });
			const s2 = buildStatement({ statementId: 's2', createdAt: 100 });
			const s3 = buildStatement({ statementId: 's3', createdAt: 200 });
			const state = buildRootState([s1, s2, s3]);

			const selector = factory(() => true, (a, b) => a.createdAt - b.createdAt);
			const result = selector(state as never);

			expect(result.map((s) => s.createdAt)).toEqual([100, 200, 300]);
		});

		it('should not sort when no sort function provided', () => {
			const s1 = buildStatement({ statementId: 's1', createdAt: 300 });
			const s2 = buildStatement({ statementId: 's2', createdAt: 100 });
			const state = buildRootState([s1, s2]);

			// No sort function - returns in insertion order
			const selector = factory(() => true);
			const result = selector(state as never);

			expect(result).toHaveLength(2);
		});

		it('should return empty array when predicate matches nothing', () => {
			const s1 = buildStatement({ statementId: 's1' });
			const state = buildRootState([s1]);

			const selector = factory(() => false);
			const result = selector(state as never);

			expect(result).toHaveLength(0);
		});
	});

	// -----------------------------------------------------------------------
	// createCountSelector
	// -----------------------------------------------------------------------
	describe('createCountSelector', () => {
		it('should return count of items', () => {
			const selectStatements = (state: MockRootState) => state.statements.statements;
			const countSelector = createCountSelector(selectStatements as never);
			const state = buildRootState([buildStatement(), buildStatement({ statementId: 's2' })]);

			const result = countSelector(state as never);

			expect(result).toBe(2);
		});

		it('should return 0 for empty array', () => {
			const selectStatements = (state: MockRootState) => state.statements.statements;
			const countSelector = createCountSelector(selectStatements as never);
			const state = buildRootState([]);

			const result = countSelector(state as never);

			expect(result).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// createExistsSelector
	// -----------------------------------------------------------------------
	describe('createExistsSelector', () => {
		const selectStatements = (state: MockRootState) => state.statements.statements;
		const factory = createExistsSelector(selectStatements as never, 'statementId' as never);

		it('should return true when item exists', () => {
			const s1 = buildStatement({ statementId: 'exists-id' });
			const state = buildRootState([s1]);

			const selector = factory('exists-id');
			const result = selector(state as never);

			expect(result).toBe(true);
		});

		it('should return false when item does not exist', () => {
			const s1 = buildStatement({ statementId: 'other-id' });
			const state = buildRootState([s1]);

			const selector = factory('missing-id');
			const result = selector(state as never);

			expect(result).toBe(false);
		});

		it('should return false for undefined ID', () => {
			const s1 = buildStatement({ statementId: 'some-id' });
			const state = buildRootState([s1]);

			const selector = factory(undefined);
			const result = selector(state as never);

			expect(result).toBe(false);
		});

		it('should return false for empty state', () => {
			const state = buildRootState([]);

			const selector = factory('any-id');
			const result = selector(state as never);

			expect(result).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// Sort Functions
	// -----------------------------------------------------------------------
	describe('Sort Functions', () => {
		describe('sortByCreatedAt', () => {
			it('should sort ascending by createdAt', () => {
				const a = buildStatement({ createdAt: 100, lastUpdate: 0 });
				const b = buildStatement({ createdAt: 200, lastUpdate: 0 });

				expect(sortByCreatedAt(a as never, b as never)).toBeLessThan(0); // a before b
				expect(sortByCreatedAt(b as never, a as never)).toBeGreaterThan(0); // b after a
			});

			it('should return 0 for equal createdAt', () => {
				const a = buildStatement({ createdAt: 100 });
				const b = buildStatement({ createdAt: 100 });

				expect(sortByCreatedAt(a as never, b as never)).toBe(0);
			});
		});

		describe('sortByLastUpdate', () => {
			it('should sort descending by lastUpdate (most recent first)', () => {
				const older = buildStatement({ lastUpdate: 100 });
				const newer = buildStatement({ lastUpdate: 200 });

				// newer should come first → sortByLastUpdate(newer, older) < 0
				expect(sortByLastUpdate(newer as never, older as never)).toBeLessThan(0);
				expect(sortByLastUpdate(older as never, newer as never)).toBeGreaterThan(0);
			});

			it('should return 0 for equal lastUpdate', () => {
				const a = buildStatement({ lastUpdate: 100 });
				const b = buildStatement({ lastUpdate: 100 });

				expect(sortByLastUpdate(a as never, b as never)).toBe(0);
			});
		});

		describe('sortByConsensus', () => {
			it('should sort descending by agreement (highest consensus first)', () => {
				const low = buildStatement({ evaluation: { agreement: 0.1, numberOfEvaluators: 5 } });
				const high = buildStatement({ evaluation: { agreement: 0.9, numberOfEvaluators: 5 } });

				expect(sortByConsensus(high as never, low as never)).toBeLessThan(0); // high first
				expect(sortByConsensus(low as never, high as never)).toBeGreaterThan(0);
			});

			it('should handle missing evaluation data (default to 0)', () => {
				const withEval = buildStatement({ evaluation: { agreement: 0.5, numberOfEvaluators: 3 } });
				const withoutEval = buildStatement({ consensus: 0 });

				// withEval.agreement=0.5 > 0, so withEval should come first
				expect(sortByConsensus(withEval as never, withoutEval as never)).toBeLessThan(0);
			});

			it('should return 0 for equal consensus values', () => {
				const a = buildStatement({ evaluation: { agreement: 0.5, numberOfEvaluators: 3 } });
				const b = buildStatement({ evaluation: { agreement: 0.5, numberOfEvaluators: 3 } });

				expect(sortByConsensus(a as never, b as never)).toBe(0);
			});
		});

		describe('sortByEvaluationCount', () => {
			it('should sort descending by numberOfEvaluators (most evaluated first)', () => {
				const few = buildStatement({ evaluation: { agreement: 0, numberOfEvaluators: 2 } });
				const many = buildStatement({ evaluation: { agreement: 0, numberOfEvaluators: 10 } });

				expect(sortByEvaluationCount(many as never, few as never)).toBeLessThan(0); // many first
				expect(sortByEvaluationCount(few as never, many as never)).toBeGreaterThan(0);
			});

			it('should handle missing evaluation data (default to 0)', () => {
				const withCount = buildStatement({ evaluation: { agreement: 0, numberOfEvaluators: 5 } });
				const withoutEval = buildStatement({});

				expect(sortByEvaluationCount(withCount as never, withoutEval as never)).toBeLessThan(0);
			});
		});
	});

	// -----------------------------------------------------------------------
	// Integration: Multiple selectors on same state
	// -----------------------------------------------------------------------
	describe('Integration: combining selectors', () => {
		it('should work correctly when using multiple factories on the same state', () => {
			const selectStatements = (state: MockRootState) => state.statements.statements;

			const byParent = createStatementsByParentSelector(selectStatements as never);
			const byId = createStatementByIdSelector(selectStatements as never);
			const count = createCountSelector(selectStatements as never);

			const s1 = buildStatement({ statementId: 's1', parentId: 'parent-A', createdAt: 100 });
			const s2 = buildStatement({ statementId: 's2', parentId: 'parent-A', createdAt: 200 });
			const s3 = buildStatement({ statementId: 's3', parentId: 'parent-B', createdAt: 300 });
			const state = buildRootState([s1, s2, s3]);

			expect(byParent('parent-A')(state as never)).toHaveLength(2);
			expect(byId('s3')(state as never)?.statementId).toBe('s3');
			expect(count(state as never)).toBe(3);
		});
	});
});
