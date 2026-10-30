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
/** Runs inside the transaction, before its reads: simulates a concurrent write. */
let beforeTxRead: (() => void) | null = null;

jest.mock('firebase-admin/firestore', () => {
	const ownersOf = (memberId: string): Statement[] =>
		[...statementDocs.values()].filter((s) => (s.integratedOptions ?? []).includes(memberId));

	return {
		getFirestore: jest.fn(() => ({
			collection: jest.fn(() => ({
				where: (_field: string, op: string, value: string) => {
					if (op === 'array-contains') return { isOwnersQuery: true, memberId: value };

					return {
						where: () => ({
							get: async () => ({
								docs: [...statementDocs.values()].map((s) => ({ data: () => s })),
							}),
						}),
					};
				},
				doc: (id: string) => ({
					id,
					get: async () => ({ exists: statementDocs.has(id), data: () => statementDocs.get(id) }),
					update: async (data: Record<string, unknown>) => {
						updates.push({ id, data });
					},
					set: async (data: Record<string, unknown>) => {
						updates.push({ id, data });
					},
				}),
			})),
			runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
				beforeTxRead?.();
				const tx = {
					get: async (ref: { id?: string; isOwnersQuery?: boolean; memberId?: string }) => {
						if (ref.isOwnersQuery) {
							return { docs: ownersOf(ref.memberId ?? '').map((s) => ({ data: () => s })) };
						}
						const data = statementDocs.get(ref.id ?? '');

						return { exists: data !== undefined, data: () => data };
					},
					update: (ref: { id: string }, data: Record<string, unknown>) => {
						updates.push({ id: ref.id, data });
					},
				};

				return fn(tx);
			},
		})),
	};
});

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
	beforeTxRead = null;
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

describe('theme writes re-check inside a transaction', () => {
	const THEME = (members: string[], extra: Record<string, unknown> = {}): Statement =>
		doc('theme1', 'Municipal Service Access', {
			isCluster: true,
			derivedByPipeline: 'topic-cluster',
			integratedOptions: members,
			...extra,
		});

	beforeEach(() => {
		assignToThemeMock.mockResolvedValue({ themeId: 'theme1', reason: 'fits' });
	});

	it('assignOptionToTheme appends to the CURRENT members, not the stale listing', async () => {
		// Between the listing and the write another worker filed rawC.
		beforeTxRead = () => statementDocs.set('theme1', THEME(['synthA', 'rawB', 'rawC']));

		const result = await assignOptionToTheme({
			option: doc('rawNew', 'Anything'),
			parent: PARENT,
			triggerSource: 'test',
		});

		expect(result.themeId).toBe('theme1');
		expect(updates).toEqual([
			{
				id: 'theme1',
				data: expect.objectContaining({
					integratedOptions: ['synthA', 'rawB', 'rawC', 'rawNew'],
				}),
			},
		]);
	});

	it('assignOptionToTheme refuses a theme hidden since the listing', async () => {
		beforeTxRead = () => statementDocs.set('theme1', THEME(['synthA', 'rawB'], { hide: true }));

		const result = await assignOptionToTheme({
			option: doc('rawNew', 'Anything'),
			parent: PARENT,
			triggerSource: 'test',
		});

		expect(result).toEqual({ themeId: null, reason: 'theme-gone' });
		expect(updates).toHaveLength(0);
	});

	it('assignOptionToTheme refuses an option another live theme claimed meanwhile', async () => {
		beforeTxRead = () =>
			statementDocs.set(
				'theme2',
				doc('theme2', 'Other', {
					isCluster: true,
					derivedByPipeline: 'topic-cluster',
					integratedOptions: ['rawNew'],
				}),
			);

		const result = await assignOptionToTheme({
			option: doc('rawNew', 'Anything'),
			parent: PARENT,
			triggerSource: 'test',
		});

		expect(result).toEqual({ themeId: null, reason: 'already-owned' });
		expect(updates).toHaveLength(0);
	});

	it('assignOptionToTheme reports already-member without writing', async () => {
		statementDocs.set('theme1', THEME(['synthA', 'rawB', 'rawNew']));

		const result = await assignOptionToTheme({
			option: doc('rawNew', 'Anything'),
			parent: PARENT,
			triggerSource: 'test',
		});

		expect(result).toEqual({ themeId: 'theme1', reason: 'already-member' });
		expect(updates).toHaveLength(0);
	});

	it('nestSynthUnderTopic replaces the synth members inside the transaction', async () => {
		beforeTxRead = () => statementDocs.set('theme1', THEME(['synthA', 'rawB', 'm1']));

		const result = await nestSynthUnderTopic({
			synthId: 'synthNew',
			memberIds: ['m1', 'rawB'],
			synthTitle: 'Open a Branch Library Downtown',
			parent: PARENT,
			settings: { createThemesFromSyntheses: false } as never,
			triggerSource: 'test',
		});

		expect(result.nested).toBe(true);
		expect(updates).toEqual([
			{
				id: 'theme1',
				data: expect.objectContaining({ integratedOptions: ['synthA', 'synthNew'] }),
			},
		]);
	});

	it('nestSynthUnderTopic refuses when the theme was hidden meanwhile', async () => {
		beforeTxRead = () => statementDocs.set('theme1', THEME(['synthA'], { hide: true }));

		const result = await nestSynthUnderTopic({
			synthId: 'synthNew',
			memberIds: [],
			synthTitle: 'Open a Branch Library Downtown',
			parent: PARENT,
			settings: { createThemesFromSyntheses: false } as never,
			triggerSource: 'test',
		});

		expect(result).toEqual({ nested: false, reason: 'theme-gone' });
		expect(updates).toHaveLength(0);
	});
});
