import { HttpsError } from 'firebase-functions/v2/https';

interface FakeDoc {
	[key: string]: unknown;
}

const store: { statements: FakeDoc[]; evaluations: FakeDoc[] } = {
	statements: [],
	evaluations: [],
};
const inQuerySizes: number[] = [];
let evaluationPageReads = 0;

interface FakeSnap {
	index: number;
	data: () => FakeDoc;
	ref: Record<string, never>;
}

interface QueryState {
	filters: Array<[string, string, unknown]>;
	limit?: number;
	after?: number;
}

function makeQuery(name: 'statements' | 'evaluations', state: QueryState) {
	const query = {
		where(field: string, op: string, value: unknown) {
			return makeQuery(name, { ...state, filters: [...state.filters, [field, op, value]] });
		},
		select() {
			return query;
		},
		limit(n: number) {
			return makeQuery(name, { ...state, limit: n });
		},
		startAfter(snap: FakeSnap) {
			return makeQuery(name, { ...state, after: snap.index });
		},
		async get() {
			const matched: FakeSnap[] = store[name]
				.map((d, index) => ({ index, data: () => d, ref: {} }))
				.filter(({ data }) =>
					state.filters.every(([field, op, value]) => {
						const d = data();
						if (op === 'in') return (value as unknown[]).includes(d[field]);

						return d[field] === value;
					}),
				)
				.filter(({ index }) => state.after === undefined || index > state.after);
			const docs = state.limit === undefined ? matched : matched.slice(0, state.limit);
			for (const [, op, value] of state.filters) {
				if (op === 'in') inQuerySizes.push((value as unknown[]).length);
			}
			if (name === 'evaluations') evaluationPageReads++;

			return { docs, size: docs.length };
		},
		doc: () => ({ update: jest.fn(), delete: jest.fn() }),
	};

	return query;
}

const batchCommit = jest.fn();

const fakeDb = {
	collection: (name: 'statements' | 'evaluations') => makeQuery(name, { filters: [] }),
	batch: () => ({ delete: jest.fn(), update: jest.fn(), commit: batchCommit }),
};

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => fakeDb,
	FieldValue: { delete: jest.fn() },
}));
jest.mock('firebase-functions', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../integrate/reverseIntegration', () => ({
	reverseIntegration: jest.fn().mockResolvedValue({ deletedEvaluationsCount: 0 }),
	deleteEvaluationsForStatement: jest.fn().mockResolvedValue(0),
}));

import {
	hasDirectVotesOnDerivedDocs,
	assertNoDirectVotesOnDerivedDocs,
	VOTE_CHECK_PAGE_SIZE,
} from '../derivedDocVotes';
import { dissolveQuestionSynthesis } from '../derivedDocs';
import { reverseIntegration } from '../../integrate/reverseIntegration';

const option = (id: string, extra: FakeDoc = {}): FakeDoc => ({
	statementId: id,
	parentId: 'q1',
	statementType: 'option',
	...extra,
});

describe('derived doc vote guard', () => {
	beforeEach(() => {
		store.statements = [];
		store.evaluations = [];
		inQuerySizes.length = 0;
		evaluationPageReads = 0;
		delete process.env.FIRESTORE_EMULATOR_HOST;
	});

	it('finds a direct vote on a hidden derived doc', async () => {
		store.statements = [
			option('o1'),
			option('s1', { isCluster: true, integratedOptions: ['o1'], derivedByPipeline: 'synthesis' }),
			option('t1', { derivedByPipeline: 'topic-cluster', hide: true }),
		];
		store.evaluations = [
			{ statementId: 'o1', evaluationId: 'd' },
			{ statementId: 't1', evaluationId: 'c' },
		];

		await expect(hasDirectVotesOnDerivedDocs('q1')).resolves.toBe(true);
	});

	it('ignores votes on real options, migrated copies and manual clusters', async () => {
		store.statements = [
			option('o1'),
			option('s1', { isCluster: true, integratedOptions: ['o1'] }),
			option('m1', { isCluster: true, titleLockedByCreator: true }),
		];
		store.evaluations = [
			{ statementId: 'o1', evaluationId: 'd' },
			{ statementId: 's1', migratedAt: 123 },
			{ statementId: 'm1', evaluationId: 'x' },
		];

		await expect(hasDirectVotesOnDerivedDocs('q1')).resolves.toBe(false);
	});

	it('batches the in-queries at 30 ids when there are no votes', async () => {
		store.statements = Array.from({ length: 65 }, (_, i) =>
			option(`s${i}`, { derivedByPipeline: 'synthesis' }),
		);
		await hasDirectVotesOnDerivedDocs('q1');

		expect(inQuerySizes).toEqual([30, 30, 5]);
	});

	it('stops reading at the first real vote', async () => {
		store.statements = Array.from({ length: 65 }, (_, i) =>
			option(`s${i}`, { derivedByPipeline: 'synthesis' }),
		);
		store.evaluations = [{ statementId: 's0', evaluationId: 'first' }];

		await expect(hasDirectVotesOnDerivedDocs('q1')).resolves.toBe(true);
		expect(evaluationPageReads).toBe(1);
		expect(inQuerySizes).toEqual([30]);
	});

	it('pages past a full page of migrated copies to a later real vote', async () => {
		store.statements = [option('s1', { derivedByPipeline: 'synthesis' })];
		store.evaluations = [
			...Array.from({ length: VOTE_CHECK_PAGE_SIZE + 5 }, (_, i) => ({
				statementId: 's1',
				evaluationId: `m${i}`,
				migratedAt: 1,
			})),
			{ statementId: 's1', evaluationId: 'real' },
		];

		await expect(hasDirectVotesOnDerivedDocs('q1')).resolves.toBe(true);
		expect(evaluationPageReads).toBe(2);
	});

	it('stops paging when only migrated copies remain', async () => {
		store.statements = [option('s1', { derivedByPipeline: 'synthesis' })];
		store.evaluations = Array.from({ length: VOTE_CHECK_PAGE_SIZE }, (_, i) => ({
			statementId: 's1',
			evaluationId: `m${i}`,
			migratedAt: 1,
		}));

		await expect(hasDirectVotesOnDerivedDocs('q1')).resolves.toBe(false);
		expect(evaluationPageReads).toBe(2);
	});

	it('assert refuses with failed-precondition and a machine-readable reason', async () => {
		store.statements = [option('s1', { derivedByPipeline: 'synthesis' })];
		store.evaluations = [{ statementId: 's1' }];

		const error = await assertNoDirectVotesOnDerivedDocs('q1').catch((e: unknown) => e);

		expect(error).toBeInstanceOf(HttpsError);
		expect((error as HttpsError).code).toBe('failed-precondition');
		expect((error as HttpsError).details).toEqual({
			reason: 'derived-docs-have-votes',
			hasVotes: true,
		});
	});

	it('assert allows when derived docs have no votes', async () => {
		store.statements = [option('s1', { derivedByPipeline: 'synthesis' })];

		await expect(assertNoDirectVotesOnDerivedDocs('q1')).resolves.toBeUndefined();
	});
});

describe('dissolveQuestionSynthesis vote guard', () => {
	beforeEach(() => {
		store.statements = [option('s1', { derivedByPipeline: 'synthesis' })];
		store.evaluations = [{ statementId: 's1' }];
		delete process.env.FIRESTORE_EMULATOR_HOST;
		jest.clearAllMocks();
	});

	it('refuses by default when votes exist, before any write', async () => {
		await expect(dissolveQuestionSynthesis('q1')).rejects.toMatchObject({
			code: 'failed-precondition',
			details: { reason: 'derived-docs-have-votes', hasVotes: true },
		});
		expect(batchCommit).not.toHaveBeenCalled();
		expect(reverseIntegration).not.toHaveBeenCalled();
	});

	it('refuses the override outside the emulator', async () => {
		await expect(dissolveQuestionSynthesis('q1', { allowDeletingVotes: true })).rejects.toThrow(
			/emulator/,
		);
	});

	it('allows the override inside the emulator', async () => {
		process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';

		await expect(
			dissolveQuestionSynthesis('q1', { allowDeletingVotes: true }),
		).resolves.toMatchObject({ docsArchived: 1 });
	});

	it('allows dissolving when no votes exist', async () => {
		store.evaluations = [];

		await expect(dissolveQuestionSynthesis('q1')).resolves.toMatchObject({ docsArchived: 1 });
	});

	it('dry run never refuses', async () => {
		await expect(dissolveQuestionSynthesis('q1', { dryRun: true })).resolves.toBeDefined();
	});
});
