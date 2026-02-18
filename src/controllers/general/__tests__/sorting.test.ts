/**
 * Comprehensive tests for sorting.ts
 *
 * Tests: sortStatementsByHierarchy, filterByStatementType, FilterType
 */

// Mock @freedi/shared-types before import to prevent valibot loading
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
	DeliberativeElement: {
		option: 'option',
		research: 'research',
	},
}));

// Local type definitions for tests
enum StatementType {
	statement = 'statement',
	option = 'option',
	question = 'question',
	document = 'document',
	group = 'group',
	comment = 'comment',
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
	parents?: string[];
}

function buildStatement(overrides: Partial<MockStatement> = {}): MockStatement {
	return {
		statementId: 'stmt-default',
		parentId: 'top',
		topParentId: 'stmt-default',
		statement: 'Default',
		statementType: StatementType.statement,
		createdAt: 1000,
		lastUpdate: 1000,
		parents: [],
		...overrides,
	};
}

import { sortStatementsByHierarchy, filterByStatementType, FilterType } from '../sorting';

describe('sortStatementsByHierarchy', () => {
	// -----------------------------------------------------------------------
	// Empty / Edge cases
	// -----------------------------------------------------------------------
	describe('edge cases', () => {
		it('should return empty array for empty input', () => {
			const result = sortStatementsByHierarchy([] as never);
			expect(result).toEqual([]);
		});

		it('should handle single top-level statement', () => {
			const s = buildStatement({ statementId: 's1', parentId: 'top' });
			const result = sortStatementsByHierarchy([s] as never);

			expect(result).toHaveLength(1);
			expect(result[0].top.statementId).toBe('s1');
		});
	});

	// -----------------------------------------------------------------------
	// Simple hierarchy
	// -----------------------------------------------------------------------
	describe('simple parent-child hierarchy', () => {
		it('should nest children under their parent', () => {
			const parent = buildStatement({
				statementId: 'parent',
				parentId: 'top',
			});
			const child = buildStatement({
				statementId: 'child',
				parentId: 'parent',
			});

			const result = sortStatementsByHierarchy([parent, child] as never);

			expect(result).toHaveLength(1);
			expect(result[0].top.statementId).toBe('parent');
			expect(result[0].sub).toHaveLength(1);
			expect(result[0].sub[0].top.statementId).toBe('child');
		});

		it('should handle multiple top-level statements', () => {
			const s1 = buildStatement({ statementId: 's1', parentId: 'top' });
			const s2 = buildStatement({ statementId: 's2', parentId: 'top' });

			const result = sortStatementsByHierarchy([s1, s2] as never);

			expect(result).toHaveLength(2);
		});

		it('should nest multiple children under a single parent', () => {
			const parent = buildStatement({ statementId: 'parent', parentId: 'top' });
			const child1 = buildStatement({ statementId: 'c1', parentId: 'parent', lastUpdate: 300 });
			const child2 = buildStatement({ statementId: 'c2', parentId: 'parent', lastUpdate: 100 });
			const child3 = buildStatement({ statementId: 'c3', parentId: 'parent', lastUpdate: 200 });

			const result = sortStatementsByHierarchy([parent, child1, child2, child3] as never);

			expect(result).toHaveLength(1);
			expect(result[0].sub).toHaveLength(3);
		});
	});

	// -----------------------------------------------------------------------
	// Deep hierarchy
	// -----------------------------------------------------------------------
	describe('deep hierarchy', () => {
		it('should handle 3-level hierarchy', () => {
			const grandparent = buildStatement({ statementId: 'gp', parentId: 'top' });
			const parent = buildStatement({ statementId: 'p', parentId: 'gp' });
			const child = buildStatement({ statementId: 'c', parentId: 'p' });

			const result = sortStatementsByHierarchy([grandparent, parent, child] as never);

			expect(result).toHaveLength(1);
			expect(result[0].top.statementId).toBe('gp');
			expect(result[0].sub).toHaveLength(1);
			expect(result[0].sub[0].top.statementId).toBe('p');
			expect(result[0].sub[0].sub).toHaveLength(1);
			expect(result[0].sub[0].sub[0].top.statementId).toBe('c');
		});
	});

	// -----------------------------------------------------------------------
	// Error resilience
	// -----------------------------------------------------------------------
	describe('error handling', () => {
		it('should handle statements passed in any order', () => {
			const parent = buildStatement({ statementId: 'parent', parentId: 'top' });
			const child = buildStatement({ statementId: 'child', parentId: 'parent' });

			// Pass child before parent
			const result = sortStatementsByHierarchy([child, parent] as never);

			// Should still produce a valid hierarchy (parent found via search)
			expect(result).toHaveLength(1);
		});
	});
});

// -----------------------------------------------------------------------
// filterByStatementType
// -----------------------------------------------------------------------
describe('filterByStatementType', () => {
	describe('FilterType.all', () => {
		it('should include options, research, and result types', () => {
			const filter = filterByStatementType(FilterType.all);
			expect(filter.types).toContain('option');
			expect(filter.types).toContain('research');
			expect(filter.types).toContain('result');
		});
	});

	describe('FilterType.questionsResults', () => {
		it('should include research and result types only', () => {
			const filter = filterByStatementType(FilterType.questionsResults);
			expect(filter.types).toContain('research');
			expect(filter.types).toContain('result');
			expect(filter.types).not.toContain('option');
		});
	});

	describe('FilterType.questionsResultsOptions', () => {
		it('should include options, research, and result types', () => {
			const filter = filterByStatementType(FilterType.questionsResultsOptions);
			expect(filter.types).toContain('option');
			expect(filter.types).toContain('research');
			expect(filter.types).toContain('result');
		});
	});

	describe('FilterType.questions', () => {
		it('should include only research type', () => {
			const filter = filterByStatementType(FilterType.questions);
			expect(filter.types).toContain('research');
			expect(filter.types).not.toContain('option');
			expect(filter.types).not.toContain('result');
		});
	});

	describe('default case', () => {
		it('should return default filter for unknown filter type', () => {
			const filter = filterByStatementType('unknown_type' as FilterType);
			// Default matches FilterType.all
			expect(filter.types).toContain('option');
			expect(filter.types).toContain('research');
			expect(filter.types).toContain('result');
		});
	});

	describe('FilterType enum', () => {
		it('should have correct values', () => {
			expect(FilterType.all).toBe('all');
			expect(FilterType.questionsResults).toBe('questionsResults');
			expect(FilterType.questionsResultsOptions).toBe('questionsResultsOptions');
			expect(FilterType.questions).toBe('questions');
		});
	});
});
