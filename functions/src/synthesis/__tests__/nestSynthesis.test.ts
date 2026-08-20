import type { Statement } from '@freedi/shared-types';

/**
 * The filing judge must be shown each theme WITH the proposals filed under it.
 *
 * This plumbing is load-bearing, not decoration: replaying a certified run's 58
 * filing decisions against their exact mid-run theme sets
 * (`scientific-research/2026-08-18-live-synth-accuracy/analysis/themeFiling.mjs`),
 * titles-only filing misfiled proposals into broad-titled attractor headings 28
 * times in 174 samples; contents plus the when-unsure-NONE bias cut that to 17.
 * RESULTS.md Finding 15. These tests pin the plumbing — that both call sites
 * resolve `integratedOptions` ids to titles from the same snapshot and pass
 * them as `ThemeOption.contents` — so a refactor cannot silently starve the
 * judge back to titles.
 */

const statementDocs = new Map<string, Statement>();
const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: jest.fn(() => ({
		collection: jest.fn(() => ({
			where: () => ({
				where: () => ({
					get: async () => ({
						docs: [...statementDocs.values()].map((s) => ({ data: () => s })),
					}),
				}),
			}),
			doc: (id: string) => ({
				get: async () => ({ exists: statementDocs.has(id), data: () => statementDocs.get(id) }),
				update: async (data: Record<string, unknown>) => {
					updates.push({ id, data });
				},
				set: async (data: Record<string, unknown>) => {
					updates.push({ id, data });
				},
			}),
		})),
	})),
}));

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const assignToThemeMock = jest.fn();
jest.mock('../../services/integration-ai-service', () => ({
	assignToTheme: (...args: unknown[]) => assignToThemeMock(...args),
	generateTopicLabel: jest.fn(async () => ({ title: 'New Theme', description: 'desc' })),
}));

jest.mock('../liveSynth/clusterRecompute', () => ({
	enqueueClusterRecompute: jest.fn(),
	findClustersContainingMember: jest.fn(async () => []),
}));
jest.mock('../liveSynth/auditLog', () => ({ recordLiveSynthEvent: jest.fn() }));
jest.mock('../pipeline/clusterOps', () => ({
	isTopicCluster: (s: Statement) =>
		(s as unknown as { derivedByPipeline?: string }).derivedByPipeline === 'topic-cluster',
}));

import { nestSynthUnderTopic, assignOptionToTheme } from '../pipeline/nestSynthesis';

const PARENT = { statementId: 'q1', statement: 'How do we improve the city?' } as Statement;

const doc = (id: string, title: string, extra: Record<string, unknown> = {}): Statement =>
	({
		statementId: id,
		statement: title,
		statementType: 'option',
		parentId: 'q1',
		createdAt: 1,
		...extra,
	}) as unknown as Statement;

beforeEach(() => {
	jest.clearAllMocks();
	statementDocs.clear();
	updates.length = 0;
	assignToThemeMock.mockResolvedValue({ themeId: null, reason: 'none' });

	// One theme holding a synthesis and a raw option; the member docs exist in
	// the same parent query snapshot, which is where their titles come from.
	statementDocs.set(
		'theme1',
		doc('theme1', 'Municipal Service Access', {
			isCluster: true,
			derivedByPipeline: 'topic-cluster',
			description: 'City services',
			integratedOptions: ['synthA', 'rawB'],
		}),
	);
	statementDocs.set('synthA', doc('synthA', 'Create One Unified Hotline'));
	statementDocs.set('rawB', doc('rawB', 'Publish the city budget in an open portal'));
	statementDocs.set('synthNew', doc('synthNew', 'Open a Branch Library Downtown'));
});

describe('the filing judge sees theme contents', () => {
	it('nestSynthUnderTopic passes each theme with the titles of what it holds', async () => {
		await nestSynthUnderTopic({
			synthId: 'synthNew',
			memberIds: ['m1', 'm2'],
			synthTitle: 'Open a Branch Library Downtown',
			parent: PARENT,
			settings: { createThemesFromSyntheses: false } as never,
			triggerSource: 'test',
		});

		expect(assignToThemeMock).toHaveBeenCalledTimes(1);
		const { themes } = assignToThemeMock.mock.calls[0][0];
		expect(themes).toEqual([
			expect.objectContaining({
				id: 'theme1',
				title: 'Municipal Service Access',
				contents: ['Create One Unified Hotline', 'Publish the city budget in an open portal'],
			}),
		]);
	});

	it('assignOptionToTheme passes the same contents', async () => {
		await assignOptionToTheme({
			option: doc('rawNew', 'Increase in-home support for older people'),
			parent: PARENT,
			triggerSource: 'test',
		});

		const { themes } = assignToThemeMock.mock.calls[0][0];
		expect(themes[0].contents).toEqual([
			'Create One Unified Hotline',
			'Publish the city budget in an open portal',
		]);
	});

	it('a member id with no resolvable title is dropped, not rendered as blank', async () => {
		statementDocs.set(
			'theme1',
			doc('theme1', 'Municipal Service Access', {
				isCluster: true,
				derivedByPipeline: 'topic-cluster',
				integratedOptions: ['synthA', 'ghost-id'],
			}),
		);

		await assignOptionToTheme({
			option: doc('rawNew', 'Anything'),
			parent: PARENT,
			triggerSource: 'test',
		});

		expect(assignToThemeMock.mock.calls[0][0].themes[0].contents).toEqual([
			'Create One Unified Hotline',
		]);
	});

	it('a NONE verdict still routes to theme creation for syntheses', async () => {
		const result = await nestSynthUnderTopic({
			synthId: 'synthNew',
			memberIds: [],
			synthTitle: 'Open a Branch Library Downtown',
			parent: PARENT,
			settings: { createThemesFromSyntheses: true } as never,
			triggerSource: 'test',
		});

		expect(result.created).toBe(true);
		expect(result.nested).toBe(true);
	});
});
