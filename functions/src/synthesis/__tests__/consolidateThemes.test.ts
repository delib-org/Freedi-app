import type { Statement } from '@freedi/shared-types';

/**
 * Covers the two behaviours the seed sweep's analysis added, both of which are
 * invisible in the sweep's own return value:
 *
 *   - the judge is shown the PROPOSALS under each heading, not just the heading;
 *   - a theme set is judged once, because the caller is a 10-minute schedule and
 *     a merge is irreversible for the reader.
 */

const sweepStateDocs = new Map<string, Record<string, unknown>>();
const statementDocs = new Map<string, Statement>();
const committed: Array<{ id: string; data: Record<string, unknown> }> = [];

jest.mock('firebase-admin/firestore', () => {
	const makeDocRef = (collectionName: string, id: string) => ({
		id,
		get: jest.fn(async () => {
			const store = collectionName === '_liveSynthThemeSweep' ? sweepStateDocs : statementDocs;
			const data = store.get(id);

			return { exists: data !== undefined, data: () => data };
		}),
		set: jest.fn(async (data: Record<string, unknown>) => {
			sweepStateDocs.set(id, data);
		}),
	});

	const collection = jest.fn((name: string) => ({
		doc: (id: string) => makeDocRef(name, id),
		where: () => ({
			where: () => ({
				get: async () => ({
					docs: [...statementDocs.values()].map((s) => ({ data: () => s })),
				}),
			}),
		}),
	}));

	return {
		getFirestore: jest.fn(() => ({
			collection,
			batch: () => ({
				update: (ref: { id: string }, data: Record<string, unknown>) => {
					committed.push({ id: ref.id, data });
				},
				commit: async () => undefined,
			}),
		})),
	};
});

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const groupEquivalentThemesMock = jest.fn();
jest.mock('../../services/integration-ai-service', () => ({
	groupEquivalentThemes: (...args: unknown[]) => groupEquivalentThemesMock(...args),
}));

jest.mock('../liveSynth/auditLog', () => ({ recordLiveSynthEvent: jest.fn() }));
jest.mock('../liveSynth/clusterRecompute', () => ({ enqueueClusterRecompute: jest.fn() }));

import { consolidateThemes } from '../pipeline/consolidateThemes';

const PARENT = 'q1';

const theme = (id: string, title: string, members: string[]): Statement =>
	({
		statementId: id,
		statement: title,
		statementType: 'option',
		parentId: PARENT,
		isCluster: true,
		derivedByPipeline: 'topic-cluster',
		integratedOptions: members,
		createdAt: 1,
	}) as unknown as Statement;

const synth = (id: string, title: string): Statement =>
	({
		statementId: id,
		statement: title,
		statementType: 'option',
		parentId: PARENT,
		isCluster: true,
		derivedByPipeline: 'synthesis',
		integratedOptions: ['raw1', 'raw2'],
		createdAt: 1,
	}) as unknown as Statement;

function seedThreeThemes(): void {
	statementDocs.clear();
	for (const s of [
		theme('t1', 'Household recycling services', ['s1']),
		theme('t2', 'Air quality monitoring', ['s2']),
		theme('t3', 'Neighborhood library access', ['s3']),
		synth('s1', 'Collect food scraps for composting'),
		synth('s2', 'Install air sensors near schools'),
		synth('s3', 'Open a branch library downtown'),
	]) {
		statementDocs.set(s.statementId, s);
	}
}

beforeEach(() => {
	jest.clearAllMocks();
	sweepStateDocs.clear();
	committed.length = 0;
	seedThreeThemes();
	groupEquivalentThemesMock.mockResolvedValue([]);
});

describe('consolidateThemes — what the judge is shown', () => {
	it('passes the proposals filed under each heading, not just the heading', async () => {
		await consolidateThemes(PARENT, 'How do we improve the city?', 'test');

		expect(groupEquivalentThemesMock).toHaveBeenCalledTimes(1);
		const { themes } = groupEquivalentThemesMock.mock.calls[0][0];
		const recycling = themes.find((t: { id: string }) => t.id === 't1');
		expect(recycling.contents).toEqual(['Collect food scraps for composting']);
		const air = themes.find((t: { id: string }) => t.id === 't2');
		expect(air.contents).toEqual(['Install air sensors near schools']);
	});

	it('omits members whose documents are missing rather than emitting blanks', async () => {
		statementDocs.set('t1', theme('t1', 'Household recycling services', ['s1', 'gone']));

		await consolidateThemes(PARENT, 'q', 'test');

		const { themes } = groupEquivalentThemesMock.mock.calls[0][0];
		expect(themes.find((t: { id: string }) => t.id === 't1').contents).toEqual([
			'Collect food scraps for composting',
		]);
	});
});

describe('consolidateThemes — each theme set is judged once', () => {
	it('does not re-ask the judge about an unchanged set', async () => {
		const first = await consolidateThemes(PARENT, 'q', 'test');
		expect(first.skipped).toBeUndefined();
		expect(groupEquivalentThemesMock).toHaveBeenCalledTimes(1);

		const second = await consolidateThemes(PARENT, 'q', 'test');
		expect(second.skipped).toBe(true);
		expect(groupEquivalentThemesMock).toHaveBeenCalledTimes(1);
	});

	it('judges again once a heading gains a proposal', async () => {
		await consolidateThemes(PARENT, 'q', 'test');
		statementDocs.set('t3', theme('t3', 'Neighborhood library access', ['s3', 's4']));

		const again = await consolidateThemes(PARENT, 'q', 'test');

		expect(again.skipped).toBeUndefined();
		expect(groupEquivalentThemesMock).toHaveBeenCalledTimes(2);
	});

	it('judges again after a merge, so a merge that opens another is still found', async () => {
		// Four headings, so the set the merge produces is still large enough to
		// consolidate — otherwise the minimum-size guard, not the fingerprint,
		// would be what stopped the second call.
		statementDocs.set('t4', theme('t4', 'Community gardens', ['s4']));
		statementDocs.set('s4', synth('s4', 'Turn vacant lots into gardens'));
		groupEquivalentThemesMock.mockResolvedValueOnce([
			{ ids: ['t1', 't2'], title: 'Environment and waste' },
		]);

		const merged = await consolidateThemes(PARENT, 'q', 'test');
		expect(merged.merges).toBe(1);

		// The sweep runs again on the set the merge produced.
		statementDocs.delete('t2');
		statementDocs.set('t1', theme('t1', 'Environment and waste', ['s1', 's2']));
		await consolidateThemes(PARENT, 'q', 'test');

		expect(groupEquivalentThemesMock).toHaveBeenCalledTimes(2);
	});

	it('judges anyway when the sweep-state read fails, rather than never tidying', async () => {
		const { getFirestore } = jest.requireMock('firebase-admin/firestore');
		const realCollection = getFirestore().collection;
		(getFirestore as jest.Mock).mockReturnValueOnce({
			collection: (name: string) =>
				name === '_liveSynthThemeSweep'
					? {
							doc: () => ({
								get: async () => {
									throw new Error('unavailable');
								},
							}),
						}
					: realCollection(name),
			batch: () => ({ update: jest.fn(), commit: jest.fn() }),
		});

		await consolidateThemes(PARENT, 'q', 'test');

		expect(groupEquivalentThemesMock).toHaveBeenCalled();
	});
});

describe('consolidateThemes — merge mechanics', () => {
	it('merges into the heading holding the most, and hides the donor', async () => {
		statementDocs.set('t1', theme('t1', 'Household recycling services', ['s1', 'sX']));
		groupEquivalentThemesMock.mockResolvedValue([
			{ ids: ['t2', 't1'], title: 'Environment and waste' },
		]);

		const result = await consolidateThemes(PARENT, 'q', 'test');

		expect(result.merges).toBe(1);
		const survivor = committed.find((c) => c.id === 't1');
		const donor = committed.find((c) => c.id === 't2');
		expect(survivor?.data.statement).toBe('Environment and waste');
		expect(survivor?.data.integratedOptions).toEqual(expect.arrayContaining(['s1', 'sX', 's2']));
		expect(donor?.data.hide).toBe(true);
		expect(donor?.data.mergedInto).toBe('t1');
	});

	it('leaves fewer than three headings alone', async () => {
		statementDocs.delete('t3');

		const result = await consolidateThemes(PARENT, 'q', 'test');

		expect(result.merges).toBe(0);
		expect(groupEquivalentThemesMock).not.toHaveBeenCalled();
	});
});
