import type { Statement } from '@freedi/shared-types';

/**
 * The split sweep is the mirror of consolidation and pins the same three
 * things: what the judge is shown, that a membership is judged once, and the
 * write mechanics — plus the two guards specific to splitting: the size
 * trigger, and the transaction refusing a parent that changed since it was
 * judged.
 */

const stateDocs = new Map<string, Record<string, unknown>>();
const statementDocs = new Map<string, Statement>();
const txWrites: Array<{ kind: 'set' | 'update'; id: string; data: Record<string, unknown> }> = [];

jest.mock('firebase-admin/firestore', () => {
	const docRef = (collectionName: string, id: string) => ({
		id,
		collectionName,
		get: jest.fn(async () => {
			const store = collectionName === '_liveSynthThemeSplit' ? stateDocs : statementDocs;
			const data = store.get(id);

			return { exists: data !== undefined, data: () => data };
		}),
		set: jest.fn(async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
			const prev = opts?.merge ? (stateDocs.get(id) ?? {}) : {};
			const judged = {
				...((prev.judged as Record<string, string>) ?? {}),
				...((data.judged as Record<string, string>) ?? {}),
			};
			stateDocs.set(id, { ...prev, ...data, judged });
		}),
	});
	const collection = jest.fn((name: string) => ({
		doc: (id: string) => docRef(name, id),
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
			runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
				const tx = {
					get: async (ref: { id: string }) => {
						const data = statementDocs.get(ref.id);

						return { exists: data !== undefined, data: () => data };
					},
					set: (ref: { id: string }, data: Record<string, unknown>) => {
						txWrites.push({ kind: 'set', id: ref.id, data });
					},
					update: (ref: { id: string }, data: Record<string, unknown>) => {
						txWrites.push({ kind: 'update', id: ref.id, data });
					},
				};
				await fn(tx);
			},
		})),
	};
});

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const proposeThemeSplitMock = jest.fn();
jest.mock('../../services/integration-ai-service', () => ({
	proposeThemeSplit: (...args: unknown[]) => proposeThemeSplitMock(...args),
}));

const recordLiveSynthEvent = jest.fn();
jest.mock('../liveSynth/auditLog', () => ({
	recordLiveSynthEvent: (...args: unknown[]) => recordLiveSynthEvent(...args),
}));
jest.mock('../liveSynth/clusterRecompute', () => ({ enqueueClusterRecompute: jest.fn() }));

import {
	isOversized,
	leafCount,
	membershipFingerprint,
	splitOversizedThemes,
} from '../pipeline/splitThemes';

const PARENT = 'q1';
const Q = 'How can research change reality?';

const theme = (id: string, title: string, members: string[]): Statement =>
	({
		statementId: id,
		statement: title,
		statementType: 'option',
		parentId: PARENT,
		parents: ['top', PARENT],
		topParentId: 'top',
		creatorId: 'u1',
		creator: { uid: 'u1' },
		isCluster: true,
		derivedByPipeline: 'topic-cluster',
		integratedOptions: members,
		createdAt: 1,
	}) as unknown as Statement;

const synth = (id: string, title: string, members: string[]): Statement =>
	({
		statementId: id,
		statement: title,
		statementType: 'option',
		parentId: PARENT,
		isCluster: true,
		derivedByPipeline: 'synthesis',
		integratedOptions: members,
		createdAt: 1,
	}) as unknown as Statement;

const option = (id: string, title: string): Statement =>
	({ statementId: id, statement: title, statementType: 'option', parentId: PARENT }) as Statement;

/** One catch-all of 10 leaves (2 synths × 2 + 6 options) beside a small theme. */
function seedCatchAll(): void {
	statementDocs.clear();
	const members = ['s1', 's2', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6'];
	for (const s of [
		theme('big', 'Harnessing research for change', members),
		theme('small', 'Funding for applied research', ['o9', 'o10']),
		synth('s1', 'Pair researchers with practitioners', ['r1', 'r2']),
		synth('s2', 'Open data platforms', ['r3', 'r4']),
		...['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o9', 'o10'].map((id) => option(id, `Idea ${id}`)),
		...['r1', 'r2', 'r3', 'r4'].map((id) => option(id, `Raw ${id}`)),
	]) {
		statementDocs.set(s.statementId, s);
	}
}

const twoSubTopics = [
	{ title: 'Researcher–practitioner ties', description: 'd1', memberIds: ['s1', 'o1', 'o2', 'o3'] },
	{ title: 'Data and platforms', description: 'd2', memberIds: ['s2', 'o4', 'o5'] },
];

beforeEach(() => {
	jest.clearAllMocks();
	stateDocs.clear();
	txWrites.length = 0;
	seedCatchAll();
	proposeThemeSplitMock.mockResolvedValue([]);
});

describe('the size trigger', () => {
	it('counts a synthesis for each of its members', () => {
		const byId = new Map([...statementDocs.values()].map((s) => [s.statementId, s]));
		expect(leafCount(statementDocs.get('big') as Statement, byId)).toBe(10);
		expect(leafCount(statementDocs.get('small') as Statement, byId)).toBe(2);
	});

	it('needs a minimum size, then a third of what is placed or an absolute size', () => {
		expect(isOversized(7, 8)).toBe(false); // too small whatever the share
		expect(isOversized(8, 30)).toBe(false); // 27% — not an attractor
		expect(isOversized(8, 20)).toBe(true); // 40%
		expect(isOversized(25, 1000)).toBe(true); // absolute
		expect(isOversized(24, 1000)).toBe(false);
	});

	it('leaves a question with no oversized theme alone, without an LLM call', async () => {
		statementDocs.set('big', theme('big', 'x', ['o1', 'o2']));

		const result = await splitOversizedThemes(PARENT, Q, 'test');

		expect(result.candidates).toBe(0);
		expect(proposeThemeSplitMock).not.toHaveBeenCalled();
	});
});

describe('what the judge is shown', () => {
	it('offers the theme, its direct members by title, the other headings, and the placed total', async () => {
		await splitOversizedThemes(PARENT, Q, 'test');

		expect(proposeThemeSplitMock).toHaveBeenCalledTimes(1);
		const input = proposeThemeSplitMock.mock.calls[0][0];
		expect(input.theme).toEqual(
			expect.objectContaining({ id: 'big', title: 'Harnessing research for change' }),
		);
		expect(input.members.map((m: { id: string }) => m.id)).toEqual([
			's1',
			's2',
			'o1',
			'o2',
			'o3',
			'o4',
			'o5',
			'o6',
		]);
		expect(input.members[0].title).toBe('Pair researchers with practitioners');
		expect(input.otherThemeTitles).toEqual(['Funding for applied research']);
		expect(input.placedTotal).toBe(12);
		expect(input.questionContext).toBe(Q);
	});
});

describe('each membership is judged once', () => {
	it('does not re-ask about an unchanged membership, even when the answer was "no split"', async () => {
		const first = await splitOversizedThemes(PARENT, Q, 'test');
		expect(first.skipped).toBe(0);

		const second = await splitOversizedThemes(PARENT, Q, 'test');

		expect(second.skipped).toBe(1);
		expect(proposeThemeSplitMock).toHaveBeenCalledTimes(1);
	});

	it('judges again once the theme gains a member', async () => {
		await splitOversizedThemes(PARENT, Q, 'test');
		const big = statementDocs.get('big') as Statement;
		statementDocs.set(
			'big',
			theme('big', big.statement ?? '', [...(big.integratedOptions ?? []), 'o7']),
		);
		statementDocs.set('o7', option('o7', 'Idea o7'));

		await splitOversizedThemes(PARENT, Q, 'test');

		expect(proposeThemeSplitMock).toHaveBeenCalledTimes(2);
	});

	it('the fingerprint is order-independent', () => {
		expect(membershipFingerprint(theme('t', 'x', ['a', 'b', 'c']))).toBe(
			membershipFingerprint(theme('t', 'x', ['c', 'a', 'b'])),
		);
		expect(membershipFingerprint(theme('t', 'x', ['a', 'b']))).not.toBe(
			membershipFingerprint(theme('t', 'x', ['a', 'b', 'c'])),
		);
	});
});

describe('applying a split', () => {
	beforeEach(() => {
		proposeThemeSplitMock.mockResolvedValue(twoSubTopics);
	});

	it('creates one theme per sub-topic, marked with its origin, and hides the parent', async () => {
		const result = await splitOversizedThemes(PARENT, Q, 'test');

		expect(result.splits).toBe(1);
		expect(result.created).toBe(2);
		const sets = txWrites.filter((w) => w.kind === 'set');
		expect(sets).toHaveLength(2);
		expect(sets[0].data).toEqual(
			expect.objectContaining({
				statement: 'Researcher–practitioner ties',
				integratedOptions: ['s1', 'o1', 'o2', 'o3'],
				derivedByPipeline: 'topic-cluster',
				isCluster: true,
				splitFrom: 'big',
				parentId: PARENT,
				hide: false,
			}),
		);
		const parentUpdate = txWrites.find((w) => w.kind === 'update' && w.id === 'big');
		expect(parentUpdate?.data).toEqual(
			expect.objectContaining({ hide: true, integratedOptions: [] }),
		);
		expect(parentUpdate?.data.splitInto).toEqual(sets.map((s) => s.id));
	});

	it('records the members the judge left out, which become unthemed', async () => {
		await splitOversizedThemes(PARENT, Q, 'test');

		expect(recordLiveSynthEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'split',
				clusterId: 'big',
				newState: expect.objectContaining({ unassigned: ['o6'] }),
			}),
		);
	});

	it('refuses to apply when the parent changed after it was judged', async () => {
		// The judge answers slowly; meanwhile the queue worker files one more
		// synthesis into the parent.
		proposeThemeSplitMock.mockImplementation(async () => {
			const big = statementDocs.get('big') as Statement;
			statementDocs.set(
				'big',
				theme('big', big.statement ?? '', [...(big.integratedOptions ?? []), 'late']),
			);

			return twoSubTopics;
		});

		const result = await splitOversizedThemes(PARENT, Q, 'test');

		expect(result.splits).toBe(0);
		expect(txWrites).toHaveLength(0);
		expect(recordLiveSynthEvent).not.toHaveBeenCalled();
	});

	it('refuses to apply when the parent was hidden meanwhile', async () => {
		proposeThemeSplitMock.mockImplementation(async () => {
			const big = statementDocs.get('big') as Statement;
			statementDocs.set('big', { ...big, hide: true } as Statement);

			return twoSubTopics;
		});

		const result = await splitOversizedThemes(PARENT, Q, 'test');

		expect(result.splits).toBe(0);
		expect(txWrites).toHaveLength(0);
	});
});
