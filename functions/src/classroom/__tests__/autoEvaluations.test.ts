import type { ClassTable, Statement } from '@freedi/shared-types';
import {
	autoEvaluationId,
	autoEvaluatorUids,
	buildAutoEvaluation,
	onClassOptionCreated,
	shouldLockWriting,
} from '../autoEvaluations';
import { FakeFirestore } from './fakeFirestore';

const MAIN = 'main1';
const TABLE_ID = `${MAIN}--1`;

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: TABLE_ID,
		mainId: MAIN,
		n: 1,
		memberUids: ['s1', 's2', 's3'],
		noDeviceMembers: [],
		step: 'write',
		askerUid: 's1',
		turn: 1,
		questionId: 'q1',
		writingMode: 'table',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: ['q1'],
		updatedAt: 0,
		...overrides,
	};
}

function option(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'opt1',
		statement: 'An answer',
		statementType: 'option',
		parentId: 'q1',
		topParentId: MAIN,
		parents: [MAIN, 'q1'],
		creatorId: 's1',
		creator: { uid: 's1', displayName: 'Dana', isAnonymous: true },
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		classTable: { tableId: TABLE_ID, shared: true, coAuthors: ['s1', 's2', 's3'] },
		...overrides,
	} as Statement;
}

describe('autoEvaluatorUids', () => {
	it('gives the author and every seated co-author, once each', () => {
		expect(autoEvaluatorUids(option(), table())).toEqual(['s1', 's2', 's3']);
	});

	it('never trusts co-authors who are not at the table', () => {
		const forged = option({
			classTable: { tableId: TABLE_ID, shared: true, coAuthors: ['s2', 'victim'] },
		});
		expect(autoEvaluatorUids(forged, table())).toEqual(['s1', 's2']);
	});

	it('gives nobody when the author is not seated there, or the table is foreign or missing', () => {
		expect(
			autoEvaluatorUids(
				option({ creatorId: 'outsider', creator: { uid: 'outsider', displayName: 'x' } }),
				table(),
			),
		).toEqual([]);
		expect(autoEvaluatorUids(option(), table({ mainId: 'other' }))).toEqual([]);
		expect(autoEvaluatorUids(option(), table({ tableId: 'main1--9' }))).toEqual([]);
		expect(autoEvaluatorUids(option(), undefined)).toEqual([]);
	});

	it('gives nobody for an option without a marker', () => {
		expect(autoEvaluatorUids(option({ classTable: undefined }), table())).toEqual([]);
	});
});

describe('buildAutoEvaluation', () => {
	it('matches the shape Join writes, with id uid--optionId and +1', () => {
		expect(buildAutoEvaluation(option(), { uid: 's2', displayName: 'Noa' }, 5)).toEqual({
			parentId: 'q1',
			evaluationId: 's2--opt1',
			statementId: 'opt1',
			evaluatorId: 's2',
			updatedAt: 5,
			evaluation: 1,
			evaluator: { uid: 's2', displayName: 'Noa', photoURL: null, isAnonymous: true },
		});
		expect(autoEvaluationId('u', 'o')).toBe('u--o');
	});
});

describe('shouldLockWriting', () => {
	it("locks only for an answer to the table's current question", () => {
		expect(shouldLockWriting(table(), option())).toBe(true);
		expect(shouldLockWriting(table({ questionId: 'q2' }), option())).toBe(false);
		expect(shouldLockWriting(table({ questionId: undefined }), option())).toBe(false);
		expect(shouldLockWriting(table({ writingLocked: true }), option())).toBe(false);
		expect(shouldLockWriting(table({ mainId: 'x' }), option())).toBe(false);
		expect(shouldLockWriting(undefined, option())).toBe(false);
	});
});

describe('onClassOptionCreated', () => {
	let fake: FakeFirestore;

	beforeEach(() => {
		fake = new FakeFirestore();
		fake.seed(`classTables/${TABLE_ID}`, table() as unknown as Record<string, unknown>);
		fake.seed(`statementsSubscribe/s2--${MAIN}`, {
			userId: 's2',
			user: { uid: 's2', displayName: 'Noa', isAnonymous: true },
		});
	});

	it('writes a +1 for the author and each co-author and locks the table', async () => {
		const count = await onClassOptionCreated(fake.asFirestore(), option());
		expect(count).toBe(3);
		expect(fake.read('evaluations/s1--opt1')).toMatchObject({
			evaluation: 1,
			evaluatorId: 's1',
			evaluator: { displayName: 'Dana' },
		});
		expect(fake.read('evaluations/s2--opt1')).toMatchObject({
			evaluation: 1,
			evaluator: { displayName: 'Noa' },
		});
		expect(fake.read('evaluations/s3--opt1')).toMatchObject({
			evaluation: 1,
			evaluator: { displayName: '' },
		});
		expect(fake.read(`classTables/${TABLE_ID}`)).toMatchObject({ writingLocked: true });
	});

	it('is idempotent and never overwrites an existing (hand) rating', async () => {
		fake.seed('evaluations/s2--opt1', { evaluation: -0.5, evaluatorId: 's2' });
		const db = fake.asFirestore();
		expect(await onClassOptionCreated(db, option())).toBe(2);
		expect(await onClassOptionCreated(db, option())).toBe(0);
		expect(fake.read('evaluations/s2--opt1')).toMatchObject({ evaluation: -0.5 });
	});

	it('does not lock the table for a proposal (other parent) but still writes the author +1', async () => {
		const proposal = option({
			statementId: 'p1',
			parentId: 'challenge',
			classTable: { tableId: TABLE_ID, shared: false, coAuthors: ['s1'] },
		});
		expect(await onClassOptionCreated(fake.asFirestore(), proposal)).toBe(1);
		expect(fake.read(`classTables/${TABLE_ID}`)).toMatchObject({ writingLocked: false });
	});

	it('writes no +1 for a forged marker: a table that does not exist or does not seat the author', async () => {
		const db = fake.asFirestore();
		const forgedTable = option({
			statementId: 'forged1',
			classTable: { tableId: `${MAIN}--7`, shared: true, coAuthors: [] },
		});
		expect(await onClassOptionCreated(db, forgedTable)).toBe(0);
		const strangerAtTable = option({
			statementId: 'forged2',
			creatorId: 'stranger',
			creator: { uid: 'stranger', displayName: 'S', isAnonymous: true },
		});
		expect(await onClassOptionCreated(db, strangerAtTable)).toBe(0);
		expect(fake.list('evaluations')).toHaveLength(0);
	});

	it('ignores options without a marker, non-options and malformed table ids', async () => {
		const db = fake.asFirestore();
		expect(await onClassOptionCreated(db, option({ classTable: undefined }))).toBe(0);
		expect(
			await onClassOptionCreated(db, option({ statementType: 'question' } as Partial<Statement>)),
		).toBe(0);
		expect(
			await onClassOptionCreated(
				db,
				option({ classTable: { tableId: 'a/b', shared: true, coAuthors: [] } }),
			),
		).toBe(0);
		expect(fake.list('evaluations')).toHaveLength(0);
	});
});
