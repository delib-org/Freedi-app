import { HttpsError } from 'firebase-functions/v2/https';

interface FakeDoc {
	[key: string]: unknown;
}

const store: { statements: FakeDoc[]; evaluations: FakeDoc[] } = {
	statements: [],
	evaluations: [],
};
const inQuerySizes: number[] = [];

function makeQuery(name: 'statements' | 'evaluations', filters: Array<[string, string, unknown]>) {
	const query = {
		where(field: string, op: string, value: unknown) {
			return makeQuery(name, [...filters, [field, op, value]]);
		},
		select() {
			return query;
		},
		async get() {
			const docs = store[name].filter((d) =>
				filters.every(([field, op, value]) => {
					if (op === 'in') return (value as unknown[]).includes(d[field]);

					return d[field] === value;
				}),
			);
			for (const [, op, value] of filters) {
				if (op === 'in') inQuerySizes.push((value as unknown[]).length);
			}

			return { docs: docs.map((d) => ({ data: () => d, ref: {} })), size: docs.length };
		},
		doc: () => ({ update: jest.fn(), delete: jest.fn() }),
	};

	return query;
}

const fakeDb = {
	collection: (name: 'statements' | 'evaluations') => makeQuery(name, []),
	batch: () => ({ delete: jest.fn(), update: jest.fn(), commit: jest.fn() }),
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
	countDirectVotesOnDerivedDocs,
	assertNoDirectVotesOnDerivedDocs,
} from '../derivedDocVotes';
import { dissolveQuestionSynthesis } from '../derivedDocs';

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
		delete process.env.FIRESTORE_EMULATOR_HOST;
	});

	it('counts direct votes on synths, topics and hidden derived docs', async () => {
		store.statements = [
			option('o1'),
			option('s1', { isCluster: true, integratedOptions: ['o1'], derivedByPipeline: 'synthesis' }),
			option('t1', { derivedByPipeline: 'topic-cluster', hide: true }),
		];
		store.evaluations = [
			{ statementId: 's1', evaluationId: 'a' },
			{ statementId: 's1', evaluationId: 'b' },
			{ statementId: 't1', evaluationId: 'c' },
			{ statementId: 'o1', evaluationId: 'd' },
		];

		await expect(countDirectVotesOnDerivedDocs('q1')).resolves.toEqual({
			votedDocCount: 2,
			voteCount: 3,
		});
	});

	it('ignores migrated copies and manual clusters', async () => {
		store.statements = [
			option('s1', { isCluster: true, integratedOptions: ['o1'] }),
			option('m1', { isCluster: true, titleLockedByCreator: true }),
		];
		store.evaluations = [
			{ statementId: 's1', migratedAt: 123 },
			{ statementId: 'm1', evaluationId: 'x' },
		];

		await expect(countDirectVotesOnDerivedDocs('q1')).resolves.toEqual({
			votedDocCount: 0,
			voteCount: 0,
		});
	});

	it('batches the in-queries at 30 ids', async () => {
		store.statements = Array.from({ length: 65 }, (_, i) =>
			option(`s${i}`, { derivedByPipeline: 'synthesis' }),
		);
		await countDirectVotesOnDerivedDocs('q1');

		expect(inQuerySizes).toEqual([30, 30, 5]);
	});

	it('assert refuses with failed-precondition and a machine-readable reason', async () => {
		store.statements = [option('s1', { derivedByPipeline: 'synthesis' })];
		store.evaluations = [{ statementId: 's1' }];

		const error = await assertNoDirectVotesOnDerivedDocs('q1').catch((e: unknown) => e);

		expect(error).toBeInstanceOf(HttpsError);
		expect((error as HttpsError).code).toBe('failed-precondition');
		expect((error as HttpsError).details).toEqual({
			reason: 'derived-docs-have-votes',
			votedDocCount: 1,
			voteCount: 1,
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
	});

	it('refuses by default when votes exist', async () => {
		await expect(dissolveQuestionSynthesis('q1')).rejects.toMatchObject({
			code: 'failed-precondition',
		});
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
