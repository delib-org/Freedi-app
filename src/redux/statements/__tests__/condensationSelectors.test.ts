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
	createViewLayersDataSelector,
	composeViewLayers,
	deriveAvailableLayers,
	gateViewLayers,
	type ViewLayersToggleState,
} from '../condensationSelectors';

enum StatementType {
	option = 'option',
	question = 'question',
	statement = 'statement',
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

// ============================================================================
// View layers (Raw / Synth / Cluster)
// ============================================================================

// Scenario: 2 topics, 2 synths, 8 raw ideas.
//   T1 (consensus 5) ⊇ {r1,r2,r3,r4}
//   T2 (consensus 3) ⊇ {r5,r6}
//   S1 (consensus 4) ⊇ {r1,r2}  → overlaps T1 (2) > T2 (0) → assigned T1
//   S2 (consensus 2) ⊇ {r9}     → overlaps nothing → top-level
//   r7 is loose (in no cluster)
function viewLayersScenario() {
	return buildState([
		option('r1'),
		option('r2'),
		option('r3'),
		option('r4'),
		option('r5'),
		option('r6'),
		option('r7'),
		option('r9'),
		option('T1', {
			isCluster: true,
			derivedByPipeline: 'topic-cluster',
			consensus: 5,
			integratedOptions: ['r1', 'r2', 'r3', 'r4'],
		}),
		option('T2', {
			isCluster: true,
			derivedByPipeline: 'topic-cluster',
			consensus: 3,
			integratedOptions: ['r5', 'r6'],
		}),
		option('S1', {
			isCluster: true,
			derivedByPipeline: 'synthesis',
			consensus: 4,
			integratedOptions: ['r1', 'r2'],
		}),
		option('S2', {
			isCluster: true,
			derivedByPipeline: 'synthesis',
			consensus: 2,
			integratedOptions: ['r9'],
		}),
	]);
}

const ALL: ViewLayersToggleState = { raw: true, synth: true, cluster: true };
const ids = (arr: { statementId: string }[]) => arr.map((s) => s.statementId).sort();

describe('createViewLayersDataSelector', () => {
	it('splits siblings and assigns synths to their max-overlap topic', () => {
		const data = createViewLayersDataSelector(selectStatements)(PARENT_ID)(viewLayersScenario());

		expect(ids(data.synthClusters)).toEqual(['S1', 'S2']);
		expect(ids(data.topicClusters)).toEqual(['T1', 'T2']);
		expect(data.rawOriginals).toHaveLength(8);
		expect(data.synthToTopic['S1']).toBe('T1'); // max overlap
		expect(data.synthToTopic['S2']).toBe(null); // zero overlap → top-level
	});

	it('prefers a direct topic→synth link over member overlap', () => {
		const state = buildState([
			option('x'),
			option('y'),
			// Topic integrates the synth ID directly (3-level encoding), and shares
			// NO raw members with it — the direct link must still win.
			option('TD', {
				isCluster: true,
				derivedByPipeline: 'topic-cluster',
				integratedOptions: ['x', 'SD'],
			}),
			option('SD', {
				isCluster: true,
				derivedByPipeline: 'synthesis',
				integratedOptions: ['y'], // no overlap with TD's raw {x}
			}),
		]);
		const data = createViewLayersDataSelector(selectStatements)(PARENT_ID)(state);
		expect(data.synthToTopic['SD']).toBe('TD');
	});

	it('breaks assignment ties toward the higher-consensus topic', () => {
		const state = buildState([
			option('a'),
			option('b'),
			option('TA', {
				isCluster: true,
				derivedByPipeline: 'topic-cluster',
				consensus: 9,
				integratedOptions: ['a'],
			}),
			option('TB', {
				isCluster: true,
				derivedByPipeline: 'topic-cluster',
				consensus: 1,
				integratedOptions: ['a'],
			}),
			option('SX', {
				isCluster: true,
				derivedByPipeline: 'synthesis',
				integratedOptions: ['a'], // overlap 1 with BOTH → tie
			}),
		]);
		const data = createViewLayersDataSelector(selectStatements)(PARENT_ID)(state);
		expect(data.synthToTopic['SX']).toBe('TA'); // higher consensus wins
	});

	it('excludes simple statements (discussion messages) from the options surface', () => {
		const state = buildState([
			option('o1'),
			option('chat1', { statementType: StatementType.statement }),
			option('chat2', { statementType: StatementType.statement }),
		]);
		const data = createViewLayersDataSelector(selectStatements)(PARENT_ID)(state);
		expect(ids(data.rawOriginals)).toEqual(['o1']);
	});
});

describe('composeViewLayers', () => {
	const data = () =>
		createViewLayersDataSelector(selectStatements)(PARENT_ID)(viewLayersScenario());

	it('All: topics nest assigned synths + direct raw; zero-overlap synth top-level; only loose raw flat', () => {
		const plan = composeViewLayers(data(), ALL);

		expect(ids(plan.topLevelSynths)).toEqual(['S2']);
		const t1 = plan.topicCards.find((c) => c.cluster.statementId === 'T1')!;
		expect(ids(t1.nestedSynths.map((n) => n.synth))).toEqual(['S1']);
		expect(ids(t1.nestedSynths[0].rawMembers)).toEqual(['r1', 'r2']);
		expect(ids(t1.directRaw)).toEqual(['r3', 'r4']); // r1,r2 nested under S1
		const t2 = plan.topicCards.find((c) => c.cluster.statementId === 'T2')!;
		expect(t2.nestedSynths).toHaveLength(0);
		expect(ids(t2.directRaw)).toEqual(['r5', 'r6']);
		expect(ids(plan.flatRaw)).toEqual(['r7']); // everything else covered
	});

	it('Raw only: every raw flat, no clusters/synths', () => {
		const plan = composeViewLayers(data(), { raw: true, synth: false, cluster: false });
		expect(plan.topLevelSynths).toHaveLength(0);
		expect(plan.topicCards).toHaveLength(0);
		expect(ids(plan.flatRaw)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r9']);
	});

	it('Synth + Raw: synths top-level, raw minus synth-covered flat', () => {
		const plan = composeViewLayers(data(), { raw: true, synth: true, cluster: false });
		expect(ids(plan.topLevelSynths)).toEqual(['S1', 'S2']);
		expect(plan.topicCards).toHaveLength(0);
		// covered = S1{r1,r2} + S2{r9}; flat = the rest
		expect(ids(plan.flatRaw)).toEqual(['r3', 'r4', 'r5', 'r6', 'r7']);
	});

	it('Clusters (raw off): topic cards with nesting, no flat raw', () => {
		const plan = composeViewLayers(data(), { raw: false, synth: true, cluster: true });
		expect(ids(plan.topLevelSynths)).toEqual(['S2']);
		expect(plan.topicCards).toHaveLength(2);
		expect(plan.flatRaw).toHaveLength(0);
	});

	it('Synth only: just synth cards', () => {
		const plan = composeViewLayers(data(), { raw: false, synth: true, cluster: false });
		expect(ids(plan.topLevelSynths)).toEqual(['S1', 'S2']);
		expect(plan.topicCards).toHaveLength(0);
		expect(plan.flatRaw).toHaveLength(0);
	});

	it('Cluster on, Synth off: topic nests ALL its raw (no synth cards)', () => {
		const plan = composeViewLayers(data(), { raw: true, synth: false, cluster: true });
		const t1 = plan.topicCards.find((c) => c.cluster.statementId === 'T1')!;
		expect(t1.nestedSynths).toHaveLength(0);
		expect(ids(t1.directRaw)).toEqual(['r1', 'r2', 'r3', 'r4']); // synth hidden → all raw direct
		// r9 was only under S2 (hidden) and in no topic → flat
		expect(plan.flatRaw.map((r) => r.statementId)).toContain('r9');
		expect(plan.flatRaw.map((r) => r.statementId)).toContain('r7');
	});
});

describe('deriveAvailableLayers', () => {
	const data = () =>
		createViewLayersDataSelector(selectStatements)(PARENT_ID)(viewLayersScenario());

	it('flags a layer available only when it has data', () => {
		expect(deriveAvailableLayers(data())).toEqual({ raw: true, synth: true, cluster: true });
	});

	it('marks synth/cluster unavailable when only raw options exist', () => {
		const state = buildState([option('a'), option('b')]);
		const onlyRaw = createViewLayersDataSelector(selectStatements)(PARENT_ID)(state);
		expect(deriveAvailableLayers(onlyRaw)).toEqual({ raw: true, synth: false, cluster: false });
	});
});

describe('gateViewLayers', () => {
	it('forces an unavailable layer off while keeping available ones', () => {
		expect(
			gateViewLayers(
				{ raw: true, synth: true, cluster: true },
				{ raw: true, synth: false, cluster: true },
			),
		).toEqual({ raw: true, synth: false, cluster: true });
	});

	it('falls back to all available layers when the selected layer has no data', () => {
		// User landed on Synth-only but only clusters + raw exist → never blank.
		expect(
			gateViewLayers(
				{ raw: false, synth: true, cluster: false },
				{ raw: true, synth: false, cluster: true },
			),
		).toEqual({ raw: true, synth: false, cluster: true });
	});

	it('returns all-off when no data exists at all', () => {
		expect(
			gateViewLayers(
				{ raw: true, synth: true, cluster: true },
				{ raw: false, synth: false, cluster: false },
			),
		).toEqual({ raw: false, synth: false, cluster: false });
	});
});
