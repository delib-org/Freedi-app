jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockGetFirestore = jest.fn();
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => mockGetFirestore(),
}));

import { restoreDissolvedVotes } from '../restoreDissolvedVotes';

type Doc = Record<string, unknown>;

/** Tiny in-memory Firestore: collections of docs, create() fails on existing ids. */
function makeFakeDb(seed: Record<string, Record<string, Doc>>) {
	const store: Record<string, Record<string, Doc>> = JSON.parse(JSON.stringify(seed));
	const createSpy = jest.fn();
	const collection = (name: string) => ({
		doc: (id: string) => ({
			get: async () => {
				const data = store[name]?.[id];

				return { exists: data !== undefined, data: () => data };
			},
			create: async (data: Doc) => {
				createSpy(name, id, data);
				store[name] = store[name] ?? {};
				if (store[name][id]) {
					throw Object.assign(new Error('exists'), { code: 6 });
				}
				store[name][id] = data;
			},
		}),
	});
	mockGetFirestore.mockReturnValue({ collection });

	return { store, createSpy };
}

const CLUSTER = 'cluster1';
const vote = (uid: string, value: number) => ({
	id: `${uid}--${CLUSTER}`,
	data: {
		evaluationId: `${uid}--${CLUSTER}`,
		statementId: CLUSTER,
		parentId: 'q1',
		evaluatorId: uid,
		evaluator: { uid, displayName: uid },
		evaluation: value,
	},
});
const option = (id: string, extra: Doc = {}) => ({
	statementId: id,
	parentId: 'q1',
	statementType: 'option',
	...extra,
});

describe('restoreDissolvedVotes', () => {
	beforeEach(() => {
		mockGetFirestore.mockReset();
	});

	it('restores each direct vote onto the single surviving option', async () => {
		const { store } = makeFakeDb({ statements: { opt1: option('opt1') }, evaluations: {} });
		const votes = [vote('u1', 1), vote('u2', -0.5)];

		const summary = await restoreDissolvedVotes({
			clusterId: CLUSTER,
			memberIds: ['opt1'],
			votes,
		});

		expect(summary.survivorId).toBe('opt1');
		expect(summary.outcomes.get(votes[0].id)).toBe('restored');
		expect(summary.outcomes.get(votes[1].id)).toBe('restored');
		expect(store.evaluations['u1--opt1']).toMatchObject({
			evaluationId: 'u1--opt1',
			statementId: 'opt1',
			parentId: 'q1',
			evaluatorId: 'u1',
			evaluation: 1,
			restoredFromClusterId: CLUSTER,
			evaluator: { uid: 'u1' },
		});
		expect(store.evaluations['u2--opt1'].evaluation).toBe(-0.5);
		// No migratedAt: the normal trigger must update the option's counters.
		expect(store.evaluations['u1--opt1']).not.toHaveProperty('migratedAt');
	});

	it('keeps the vote of a user who already evaluated the survivor', async () => {
		const own = { evaluationId: 'u1--opt1', statementId: 'opt1', evaluation: -1 };
		const { store } = makeFakeDb({
			statements: { opt1: option('opt1') },
			evaluations: { 'u1--opt1': own },
		});
		const votes = [vote('u1', 1), vote('u2', 1)];

		const summary = await restoreDissolvedVotes({
			clusterId: CLUSTER,
			memberIds: ['opt1'],
			votes,
		});

		expect(summary.outcomes.get(votes[0].id)).toBe('user-already-voted');
		expect(summary.outcomes.get(votes[1].id)).toBe('restored');
		expect(store.evaluations['u1--opt1']).toEqual(own);
	});

	it('archives only when several visible members remain', async () => {
		const { store, createSpy } = makeFakeDb({
			statements: { opt1: option('opt1'), opt2: option('opt2') },
			evaluations: {},
		});
		const votes = [vote('u1', 1)];

		const summary = await restoreDissolvedVotes({
			clusterId: CLUSTER,
			memberIds: ['opt1', 'opt2'],
			votes,
		});

		expect(summary.survivorId).toBeNull();
		expect(summary.memberOptionIds).toEqual(['opt1', 'opt2']);
		expect(summary.outcomes.get(votes[0].id)).toBe('no-single-survivor');
		expect(createSpy).not.toHaveBeenCalled();
		expect(store.evaluations).toEqual({});
	});

	it('does not restore onto a hidden or missing survivor', async () => {
		const { createSpy } = makeFakeDb({
			statements: { opt1: option('opt1', { hide: true }) },
			evaluations: {},
		});
		const votes = [vote('u1', 1)];

		const summary = await restoreDissolvedVotes({
			clusterId: CLUSTER,
			memberIds: ['opt1', 'gone'],
			votes,
		});

		expect(summary.outcomes.get(votes[0].id)).toBe('survivor-unavailable');
		expect(createSpy).not.toHaveBeenCalled();
	});

	it('is idempotent: a retry creates no duplicate and reports already-restored', async () => {
		const { store } = makeFakeDb({ statements: { opt1: option('opt1') }, evaluations: {} });
		const votes = [vote('u1', 1)];
		const input = { clusterId: CLUSTER, memberIds: ['opt1'], votes };

		await restoreDissolvedVotes(input);
		const firstDoc = { ...store.evaluations['u1--opt1'] };
		const retry = await restoreDissolvedVotes(input);

		expect(retry.outcomes.get(votes[0].id)).toBe('already-restored');
		expect(Object.keys(store.evaluations)).toEqual(['u1--opt1']);
		expect(store.evaluations['u1--opt1']).toEqual(firstDoc);
	});

	it('restores a neutral (0) vote like any other value', async () => {
		const { store } = makeFakeDb({ statements: { opt1: option('opt1') }, evaluations: {} });
		const votes = [vote('u1', 0)];

		const summary = await restoreDissolvedVotes({
			clusterId: CLUSTER,
			memberIds: ['opt1'],
			votes,
		});

		expect(summary.outcomes.get(votes[0].id)).toBe('restored');
		expect(store.evaluations['u1--opt1']).toMatchObject({ evaluation: 0, evaluatorId: 'u1' });
	});

	it('always writes an evaluator, falling back to the voter id', async () => {
		const { store } = makeFakeDb({ statements: { opt1: option('opt1') }, evaluations: {} });
		const votes = [{ id: 'u3--cluster1', data: { evaluatorId: 'u3', evaluation: 1 } }];

		await restoreDissolvedVotes({ clusterId: CLUSTER, memberIds: ['opt1'], votes });

		expect(store.evaluations['u3--opt1'].evaluator).toEqual({ uid: 'u3', displayName: '' });
	});

	it('takes the uid from evaluator when evaluatorId is missing', async () => {
		const { store } = makeFakeDb({ statements: { opt1: option('opt1') }, evaluations: {} });
		const votes = [
			{
				id: 'u4--cluster1',
				data: { evaluator: { uid: 'u4', displayName: 'Dana' }, evaluation: -1 },
			},
		];

		await restoreDissolvedVotes({ clusterId: CLUSTER, memberIds: ['opt1'], votes });

		expect(store.evaluations['u4--opt1']).toMatchObject({
			evaluatorId: 'u4',
			evaluator: { uid: 'u4', displayName: 'Dana' },
		});
	});

	it('skips votes with no user or no numeric value, with distinct outcomes', async () => {
		const { createSpy } = makeFakeDb({ statements: { opt1: option('opt1') }, evaluations: {} });
		const votes = [
			{ id: 'nouser', data: { evaluation: 1, evaluator: { displayName: 'x' } } },
			{ id: 'novalue', data: { evaluatorId: 'u5' } },
		];

		const summary = await restoreDissolvedVotes({
			clusterId: CLUSTER,
			memberIds: ['opt1'],
			votes,
		});

		expect(summary.outcomes.get('nouser')).toBe('no-user');
		expect(summary.outcomes.get('novalue')).toBe('empty-vote');
		expect(createSpy).not.toHaveBeenCalled();
	});

	it('reports failed when create() fails for a reason other than already-exists', async () => {
		makeFakeDb({ statements: { opt1: option('opt1') }, evaluations: {} });
		const fakeDb = mockGetFirestore() as { collection: (n: string) => unknown };
		mockGetFirestore.mockReturnValue({
			collection: (name: string) => {
				const real = fakeDb.collection(name) as { doc: (id: string) => object };
				if (name !== 'evaluations') return real;

				return {
					doc: (id: string) => ({
						...real.doc(id),
						create: async () => {
							throw Object.assign(new Error('unavailable'), { code: 14 });
						},
					}),
				};
			},
		});
		const votes = [vote('u1', 1), vote('u2', 1)];

		const summary = await restoreDissolvedVotes({
			clusterId: CLUSTER,
			memberIds: ['opt1'],
			votes,
		});

		expect(summary.survivorId).toBe('opt1');
		expect(summary.outcomes.get(votes[0].id)).toBe('failed');
		expect(summary.outcomes.get(votes[1].id)).toBe('failed');
	});
});
