import type { Statement } from '@freedi/shared-types';

/**
 * The file-unthemed sweep re-offers atoms no theme claims. Pins the atom
 * contract (a synthesis's members are never atoms), judged-once behaviour, the
 * judge-error retry rule, and that the write is a transaction that refuses a
 * theme hidden since the read.
 */

const stateDocs = new Map<string, Record<string, unknown>>();
const statementDocs = new Map<string, Statement>();
const txWrites: Array<{ id: string; data: Record<string, unknown> }> = [];
/** Runs inside the transaction, before the theme is read: simulates a concurrent write. */
let beforeTxRead: (() => void) | null = null;

jest.mock('firebase-admin/firestore', () => {
	const docRef = (collectionName: string, id: string) => ({
		id,
		get: jest.fn(async () => {
			const store = collectionName === '_liveSynthThemeFile' ? stateDocs : statementDocs;
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
	const ownersOf = (memberId: string) =>
		[...statementDocs.values()].filter((s) => (s.integratedOptions ?? []).includes(memberId));
	const collection = jest.fn((name: string) => ({
		doc: (id: string) => docRef(name, id),
		where: (field: string, op: string, value: string) => {
			if (op === 'array-contains') {
				return { isOwnersQuery: true, memberId: value, field };
			}

			return {
				where: () => ({
					get: async () => ({
						docs: [...statementDocs.values()].map((s) => ({ data: () => s })),
					}),
				}),
			};
		},
	}));

	return {
		getFirestore: jest.fn(() => ({
			collection,
			runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
				const tx = {
					get: async (ref: { id?: string; isOwnersQuery?: boolean; memberId?: string }) => {
						if (ref.isOwnersQuery) {
							return { docs: ownersOf(ref.memberId ?? '').map((s) => ({ data: () => s })) };
						}
						beforeTxRead?.();
						const data = statementDocs.get(ref.id ?? '');

						return { exists: data !== undefined, data: () => data };
					},
					update: (ref: { id: string }, data: Record<string, unknown>) => {
						txWrites.push({ id: ref.id, data });
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
	generateTopicLabel: jest.fn(),
}));

const recordLiveSynthEvent = jest.fn();
jest.mock('../liveSynth/auditLog', () => ({
	recordLiveSynthEvent: (...args: unknown[]) => recordLiveSynthEvent(...args),
}));
const enqueueClusterRecompute = jest.fn();
jest.mock('../liveSynth/clusterRecompute', () => ({
	enqueueClusterRecompute: (...args: unknown[]) => enqueueClusterRecompute(...args),
	findClustersContainingMember: jest.fn(async () => []),
}));

import {
	MAX_FILES_PER_SWEEP,
	fileUnthemedAtoms,
	findUnthemedAtoms,
} from '../pipeline/fileUnthemed';

const PARENT = 'q1';
const Q = 'How can research change reality?';

const theme = (id: string, title: string, members: string[], extra = {}): Statement =>
	({
		statementId: id,
		statement: title,
		statementType: 'option',
		parentId: PARENT,
		isCluster: true,
		derivedByPipeline: 'topic-cluster',
		integratedOptions: members,
		createdAt: 1,
		...extra,
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
		createdAt: 2,
	}) as unknown as Statement;

const option = (id: string, title: string, createdAt = 3): Statement =>
	({
		statementId: id,
		statement: title,
		statementType: 'option',
		parentId: PARENT,
		createdAt,
	}) as Statement;

function seed(...docs: Statement[]): void {
	statementDocs.clear();
	for (const d of docs) statementDocs.set(d.statementId, d);
}

describe('fileUnthemed', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		stateDocs.clear();
		txWrites.length = 0;
		beforeTxRead = null;
		assignToThemeMock.mockReset();
	});

	describe('findUnthemedAtoms', () => {
		it('treats synthesis members as part of the synthesis, never as atoms', () => {
			const t = theme('t1', 'Transport', ['s1']);
			const all = [t, synth('s1', 'Buses', ['o1', 'o2']), option('o1', 'a'), option('o2', 'b')];

			expect(findUnthemedAtoms(all, [t])).toEqual([]);
		});

		it('returns an unthemed synthesis but not its members', () => {
			const t = theme('t1', 'Transport', ['o9']);
			const all = [t, synth('s1', 'Buses', ['o1', 'o2']), option('o1', 'a'), option('o2', 'b')];

			expect(findUnthemedAtoms(all, [t]).map((a) => a.statementId)).toEqual(['s1']);
		});

		it('ignores hidden docs', () => {
			const t = theme('t1', 'Transport', []);
			const hidden = { ...option('o1', 'a'), hide: true } as Statement;

			expect(findUnthemedAtoms([t, hidden], [t])).toEqual([]);
		});
	});

	describe('fileUnthemedAtoms', () => {
		it('files an unthemed option under the judged theme', async () => {
			seed(
				theme('t1', 'Transport', ['o9']),
				option('o9', 'Bike lanes'),
				option('o1', 'More buses'),
			);
			assignToThemeMock.mockResolvedValue({ themeId: 't1', reason: 'fits' });

			const result = await fileUnthemedAtoms(PARENT, Q, 'reJudge');

			expect(result.filed).toBe(1);
			expect(assignToThemeMock).toHaveBeenCalledTimes(1);
			expect(assignToThemeMock.mock.calls[0][0].proposalTitle).toBe('More buses');
			expect(txWrites).toHaveLength(1);
			expect(txWrites[0].id).toBe('t1');
			expect(txWrites[0].data.integratedOptions).toEqual(['o9', 'o1']);
			expect(recordLiveSynthEvent).toHaveBeenCalledTimes(1);
			expect(enqueueClusterRecompute).toHaveBeenCalledWith('t1', 'reJudge:fileUnthemed');
		});

		it('files an unthemed synthesis as one atom and never files its members', async () => {
			seed(
				theme('t1', 'Transport', ['o9']),
				option('o9', 'Bike lanes'),
				synth('s1', 'Run more buses', ['o1', 'o2']),
				option('o1', 'More buses'),
				option('o2', 'Buses please'),
			);
			assignToThemeMock.mockResolvedValue({ themeId: 't1', reason: 'fits' });

			const result = await fileUnthemedAtoms(PARENT, Q, 'reJudge');

			expect(result.atoms).toBe(1);
			expect(assignToThemeMock).toHaveBeenCalledTimes(1);
			expect(assignToThemeMock.mock.calls[0][0].proposalTitle).toBe('Run more buses');
			expect(txWrites[0].data.integratedOptions).toEqual(['o9', 's1']);
		});

		it('skips atoms that already have a theme', async () => {
			seed(theme('t1', 'Transport', ['o1']), option('o1', 'More buses'));

			const result = await fileUnthemedAtoms(PARENT, Q, 'reJudge');

			expect(result.atoms).toBe(0);
			expect(assignToThemeMock).not.toHaveBeenCalled();
		});

		it('creates nothing and calls no judge when there are no themes', async () => {
			seed(option('o1', 'More buses'));

			const result = await fileUnthemedAtoms(PARENT, Q, 'reJudge');

			expect(result.atoms).toBe(0);
			expect(assignToThemeMock).not.toHaveBeenCalled();
			expect(txWrites).toHaveLength(0);
		});

		it('judges once per theme list, and again after the list changes', async () => {
			seed(theme('t1', 'Transport', ['o9']), option('o9', 'Bike lanes'), option('o1', 'Odd idea'));
			assignToThemeMock.mockResolvedValue({ themeId: null, reason: 'NONE' });

			await fileUnthemedAtoms(PARENT, Q, 'reJudge');
			const second = await fileUnthemedAtoms(PARENT, Q, 'reJudge');

			expect(assignToThemeMock).toHaveBeenCalledTimes(1);
			expect(second.skipped).toBe(1);

			// A new theme appears: the theme list changed, so the atom is re-offered.
			statementDocs.set('t2', theme('t2', 'Culture', ['o8'], { createdAt: 5 }));
			statementDocs.set('o8', option('o8', 'Festival'));
			await fileUnthemedAtoms(PARENT, Q, 'reJudge');

			expect(assignToThemeMock).toHaveBeenCalledTimes(2);
		});

		it('re-judges when a theme is renamed', async () => {
			seed(theme('t1', 'Transport', ['o9']), option('o9', 'Bike lanes'), option('o1', 'Odd idea'));
			assignToThemeMock.mockResolvedValue({ themeId: null, reason: 'NONE' });

			await fileUnthemedAtoms(PARENT, Q, 'reJudge');
			statementDocs.set('t1', theme('t1', 'Mobility', ['o9']));
			await fileUnthemedAtoms(PARENT, Q, 'reJudge');

			expect(assignToThemeMock).toHaveBeenCalledTimes(2);
		});

		it('leaves the atom alone when the judge answers NONE', async () => {
			seed(theme('t1', 'Transport', ['o9']), option('o9', 'Bike lanes'), option('o1', 'Odd idea'));
			assignToThemeMock.mockResolvedValue({ themeId: null, reason: 'NONE' });

			const result = await fileUnthemedAtoms(PARENT, Q, 'reJudge');

			expect(result.refused).toBe(1);
			expect(txWrites).toHaveLength(0);
			expect(recordLiveSynthEvent).not.toHaveBeenCalled();
		});

		it('leaves the atom and records no fingerprint when the judge fails, so it retries', async () => {
			seed(theme('t1', 'Transport', ['o9']), option('o9', 'Bike lanes'), option('o1', 'Odd idea'));
			assignToThemeMock.mockRejectedValueOnce(new Error('LLM down'));

			const first = await fileUnthemedAtoms(PARENT, Q, 'reJudge');

			expect(first.errors).toBe(1);
			expect(txWrites).toHaveLength(0);
			expect(stateDocs.get(PARENT)).toBeUndefined();

			assignToThemeMock.mockResolvedValueOnce({ themeId: 't1', reason: 'fits' });
			const second = await fileUnthemedAtoms(PARENT, Q, 'reJudge');

			expect(assignToThemeMock).toHaveBeenCalledTimes(2);
			expect(second.filed).toBe(1);
		});

		it('aborts the write when the theme was hidden since the read', async () => {
			seed(
				theme('t1', 'Transport', ['o9']),
				option('o9', 'Bike lanes'),
				option('o1', 'More buses'),
			);
			assignToThemeMock.mockResolvedValue({ themeId: 't1', reason: 'fits' });
			beforeTxRead = () => {
				statementDocs.set('t1', theme('t1', 'Transport', ['o9'], { hide: true }));
			};

			const result = await fileUnthemedAtoms(PARENT, Q, 'reJudge');

			expect(result.filed).toBe(0);
			expect(txWrites).toHaveLength(0);
			expect(recordLiveSynthEvent).not.toHaveBeenCalled();
			expect(enqueueClusterRecompute).not.toHaveBeenCalled();
		});

		it('aborts the write when the atom was themed since the read', async () => {
			seed(
				theme('t1', 'Transport', ['o9']),
				theme('t2', 'Culture', []),
				option('o9', 'Bike lanes'),
				option('o1', 'More buses'),
			);
			assignToThemeMock.mockResolvedValue({ themeId: 't1', reason: 'fits' });
			beforeTxRead = () => {
				statementDocs.set('t2', theme('t2', 'Culture', ['o1']));
			};

			const result = await fileUnthemedAtoms(PARENT, Q, 'reJudge');

			expect(result.filed).toBe(0);
			expect(txWrites).toHaveLength(0);
		});

		it('stops at the per-sweep budget', async () => {
			const options = Array.from({ length: MAX_FILES_PER_SWEEP + 5 }, (_, i) =>
				option(`o${i}`, `Idea ${i}`, 10 + i),
			);
			seed(theme('t1', 'Transport', ['x']), ...options);
			assignToThemeMock.mockResolvedValue({ themeId: null, reason: 'NONE' });

			await fileUnthemedAtoms(PARENT, Q, 'reJudge');

			expect(assignToThemeMock).toHaveBeenCalledTimes(MAX_FILES_PER_SWEEP);
		});
	});
});
