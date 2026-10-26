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

	it('skips neutral and malformed votes', async () => {
		const { createSpy } = makeFakeDb({ statements: { opt1: option('opt1') }, evaluations: {} });
		const votes = [vote('u1', 0), { id: 'x', data: { evaluation: 1 } }];

		const summary = await restoreDissolvedVotes({
			clusterId: CLUSTER,
			memberIds: ['opt1'],
			votes,
		});

		expect(summary.outcomes.get(votes[0].id)).toBe('empty-vote');
		expect(summary.outcomes.get('x')).toBe('empty-vote');
		expect(createSpy).not.toHaveBeenCalled();
	});
});
