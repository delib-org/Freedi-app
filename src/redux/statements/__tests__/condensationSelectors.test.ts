/**
 * Tests for the grouped-view (condensation) selectors.
 *
 * Focus: de-duplication of originals that are already represented by a
 * rendered cluster (synthesis or framing), and the new `groupedMemberIds`
 * set that consumers use to hide those originals from the flat list.
 */

// Mock @freedi/shared-types before imports (valibot schemas break in jsdom).
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

import {
	createGroupedViewSelector,
	createMembershipForOriginalSelector,
} from '../condensationSelectors';

enum StatementType {
	option = 'option',
	question = 'question',
}

interface MockStatement {
	statementId: string;
	parentId: string;
	topParentId?: string;
	statement: string;
	statementType: StatementType;
	createdAt: number;
	lastUpdate: number;
	consensus?: number;
	hide?: boolean;
	isCluster?: boolean;
	framingId?: string | null;
	derivedByPipeline?: string;
	integratedOptions?: string[];
	statementSettings?: {
		condensation?: {
			enabled?: boolean;
			visibility?: Record<string, string>;
			allowDrillToOriginals?: boolean;
		};
	};
}

const PARENT_ID = 'q1';

function option(id: string, overrides: Partial<MockStatement> = {}): MockStatement {
	return {
		statementId: id,
		parentId: PARENT_ID,
		topParentId: PARENT_ID,
		statement: `option ${id}`,
		statementType: StatementType.option,
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		hide: false,
		...overrides,
	};
}

function buildState(
	statements: MockStatement[],
	condensation?: MockStatement['statementSettings'],
) {
	const parent: MockStatement = {
		statementId: PARENT_ID,
		parentId: 'top',
		topParentId: PARENT_ID,
		statement: 'parent question',
		statementType: StatementType.question,
		createdAt: 0,
		lastUpdate: 0,
		statementSettings: condensation,
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { statements: { statements: [parent, ...statements] as any } };
}

const selectStatements = (state: ReturnType<typeof buildState>) => state.statements.statements;

describe('createGroupedViewSelector', () => {
	it('puts every cluster member into groupedMemberIds', () => {
		const statements = [
			option('s1'),
			option('s2'),
			option('s3'),
			option('c1', {
				isCluster: true,
				derivedByPipeline: 'synthesis',
				integratedOptions: ['s1', 's2'],
			}),
		];
		const state = buildState(statements);
		const view = createGroupedViewSelector(selectStatements)(PARENT_ID, 'main')(state);

		expect(view.groupedMemberIds.has('s1')).toBe(true);
		expect(view.groupedMemberIds.has('s2')).toBe(true);
		expect(view.groupedMemberIds.has('s3')).toBe(false);
		expect(view.groupedSuggestions.map((s) => s.statementId)).toEqual(['c1']);
		expect(view.membershipMap['s1']).toEqual(['c1']);
	});

	it('keeps all originals in "both" mode (consumer handles flat-list de-dup)', () => {
		const statements = [
			option('s1'),
			option('s2'),
			option('c1', {
				isCluster: true,
				derivedByPipeline: 'synthesis',
				integratedOptions: ['s1'],
			}),
		];
		const view = createGroupedViewSelector(selectStatements)(PARENT_ID, 'main')(
			buildState(statements),
		);

		// Selector itself returns both in "both" mode; de-dup is applied by the
		// consumer using groupedMemberIds.
		expect(view.mode).toBe('both');
		expect(view.visibleOriginals.map((s) => s.statementId).sort()).toEqual(['s1', 's2']);
	});

	it('hides grouped originals from visibleOriginals in clusters-only mode', () => {
		const statements = [
			option('s1'),
			option('s2'),
			option('c1', {
				isCluster: true,
				derivedByPipeline: 'synthesis',
				integratedOptions: ['s1'],
			}),
		];
		const condensation = {
			condensation: { enabled: true, visibility: { main: 'clusters-only' } },
		};
		const view = createGroupedViewSelector(selectStatements)(PARENT_ID, 'main')(
			buildState(statements, condensation),
		);

		expect(view.mode).toBe('clusters-only');
		expect(view.visibleOriginals.map((s) => s.statementId)).toEqual(['s2']);
	});

	it('restricts clusters to the active framing, leaving other members ungrouped', () => {
		const statements = [
			option('s1'),
			option('s2'),
			option('c1', {
				isCluster: true,
				framingId: 'fA',
				derivedByPipeline: 'topic-cluster',
				integratedOptions: ['s1'],
			}),
			option('c2', {
				isCluster: true,
				framingId: 'fB',
				derivedByPipeline: 'topic-cluster',
				integratedOptions: ['s2'],
			}),
		];
		const view = createGroupedViewSelector(selectStatements)(PARENT_ID, 'main', 'fA')(
			buildState(statements),
		);

		// Only the framing-A cluster surfaces; s1 is its member, s2 is not grouped.
		expect(view.groupedSuggestions.map((s) => s.statementId)).toEqual(['c1']);
		expect(view.groupedMemberIds.has('s1')).toBe(true);
		expect(view.groupedMemberIds.has('s2')).toBe(false);
	});

	it('excludes hidden siblings entirely', () => {
		const statements = [
			option('s1'),
			option('s2', { hide: true }),
			option('c1', {
				isCluster: true,
				derivedByPipeline: 'synthesis',
				integratedOptions: ['s1'],
			}),
		];
		const view = createGroupedViewSelector(selectStatements)(PARENT_ID, 'main')(
			buildState(statements),
		);

		expect(view.visibleOriginals.map((s) => s.statementId)).toEqual(['s1']);
	});
});

describe('createMembershipForOriginalSelector', () => {
	it('returns the clusters that integrate a given original', () => {
		const statements = [
			option('s1'),
			option('c1', {
				isCluster: true,
				derivedByPipeline: 'synthesis',
				integratedOptions: ['s1'],
			}),
		];
		const clusters = createMembershipForOriginalSelector(selectStatements)('s1', PARENT_ID)(
			buildState(statements),
		);

		expect(clusters.map((c) => c.statementId)).toEqual(['c1']);
	});

	it('returns empty when ids are missing', () => {
		const state = buildState([option('s1')]);
		expect(
			createMembershipForOriginalSelector(selectStatements)(undefined, PARENT_ID)(state),
		).toEqual([]);
		expect(createMembershipForOriginalSelector(selectStatements)('s1', undefined)(state)).toEqual(
			[],
		);
	});
});
