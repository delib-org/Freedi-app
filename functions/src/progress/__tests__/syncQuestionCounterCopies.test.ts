import { Collections, StatementType } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from './fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../../db', () => ({
	get db() {
		return fake.db;
	},
}));

import { RECENT_ACTIVITY_WINDOW_MS, syncQuestionCounterCopies } from '../syncQuestionCounterCopies';

const Q = 'q1';
const NOW = 1_800_000_000_000;

type Doc = Record<string, unknown>;

const seedQuestion = (over: Doc = {}): void =>
	fake.seed(Collections.statements, Q, {
		statementId: Q,
		statementType: StatementType.question,
		numberOfMembers: 95,
		totalEvaluators: 95,
		evaluation: { asParentTotalEvaluators: 95 },
		lastUpdate: 1,
		...over,
	});

const seedProgress = (over: Doc = {}): void =>
	fake.seed(Collections.questionProgress, Q, {
		statementId: Q,
		evaluated: 97,
		members: 97,
		lastUpdate: NOW - 1000,
		...over,
	});

function seedPeople(members: number, raters: number): void {
	for (let i = 0; i < members; i += 1) {
		fake.seed(Collections.statementsSubscribe, `m${i}--${Q}`, {
			statementId: Q,
			statementType: StatementType.question,
		});
	}
	for (let i = 0; i < raters; i += 1) {
		fake.seed(Collections.evaluationParticipants, `${Q}--r${i}`, { parentId: Q, userId: `r${i}` });
	}
}

const question = (): Doc | undefined => fake.read(Collections.statements, Q);

describe('syncQuestionCounterCopies', () => {
	beforeEach(() => {
		fake = createFakeDb();
	});

	it('writes the exact counts to a recently active question', async () => {
		seedQuestion();
		seedProgress();
		seedPeople(97, 97);

		await expect(syncQuestionCounterCopies(NOW)).resolves.toEqual({ checked: 1, updated: 1 });

		expect(question()).toMatchObject({
			numberOfMembers: 97,
			totalEvaluators: 97,
			evaluation: { asParentTotalEvaluators: 97 },
		});
		expect(question()?.lastUpdate).toBeGreaterThan(1);
	});

	it('does not write a question whose copies are already exact', async () => {
		seedQuestion({
			numberOfMembers: 97,
			totalEvaluators: 97,
			evaluation: { asParentTotalEvaluators: 97 },
		});
		seedProgress();
		seedPeople(97, 97);

		await expect(syncQuestionCounterCopies(NOW)).resolves.toEqual({ checked: 1, updated: 0 });

		expect(question()?.lastUpdate).toBe(1);
	});

	it('reads nothing for a question that has gone quiet', async () => {
		seedQuestion();
		seedProgress({ lastUpdate: NOW - RECENT_ACTIVITY_WINDOW_MS - 1 });

		await expect(syncQuestionCounterCopies(NOW)).resolves.toEqual({ checked: 0, updated: 0 });

		expect(question()?.numberOfMembers).toBe(95);
	});

	it('heals a progress count left wrong by two recounts landing out of order', async () => {
		seedQuestion({ numberOfMembers: 97 });
		seedProgress({ members: 96, evaluated: 95 });
		seedPeople(97, 95);
		const before = fake.read(Collections.questionProgress, Q)?.lastUpdate;

		await syncQuestionCounterCopies(NOW);

		expect(fake.read(Collections.questionProgress, Q)?.members).toBe(97);
		// Moving lastUpdate here would keep the question in the window forever.
		expect(fake.read(Collections.questionProgress, Q)?.lastUpdate).toBe(before);
	});

	it('leaves the member copy alone when the progress doc has no member count', async () => {
		seedQuestion({ totalEvaluators: 97, evaluation: { asParentTotalEvaluators: 97 } });
		seedProgress({ members: undefined });
		seedPeople(150, 0);

		await syncQuestionCounterCopies(NOW);

		expect(question()?.numberOfMembers).toBe(95);
	});

	it('leaves an answer with its own rater count untouched', async () => {
		fake.seed(Collections.statements, Q, {
			statementId: Q,
			statementType: StatementType.option,
			totalEvaluators: 40,
			evaluation: { numberOfEvaluators: 40 },
			lastUpdate: 1,
		});
		seedProgress({ evaluated: 0, members: undefined });

		await expect(syncQuestionCounterCopies(NOW)).resolves.toEqual({ checked: 1, updated: 0 });

		expect(question()).toMatchObject({ totalEvaluators: 40, lastUpdate: 1 });
		expect(question()?.evaluation).toEqual({ numberOfEvaluators: 40 });
	});

	it('does not touch a member count on a statement type that does not keep one', async () => {
		fake.seed(Collections.statements, Q, {
			statementId: Q,
			statementType: StatementType.option,
			numberOfMembers: 5,
			lastUpdate: 1,
		});
		seedProgress({ evaluated: 0, members: 9 });
		seedPeople(2, 0);

		await syncQuestionCounterCopies(NOW);

		expect(question()).toMatchObject({ numberOfMembers: 5, lastUpdate: 1 });
		expect(fake.read(Collections.questionProgress, Q)?.members).toBe(9);
	});

	it('does not lower a legacy question with a high count and no markers', async () => {
		seedQuestion({
			numberOfMembers: 97,
			totalEvaluators: 300,
			evaluation: { asParentTotalEvaluators: 300 },
		});
		seedProgress({ evaluated: 0 });
		seedPeople(97, 0);

		await expect(syncQuestionCounterCopies(NOW)).resolves.toEqual({ checked: 1, updated: 0 });

		expect(question()).toMatchObject({
			totalEvaluators: 300,
			evaluation: { asParentTotalEvaluators: 300 },
			lastUpdate: 1,
		});
	});

	it('skips a progress doc whose statement is gone', async () => {
		seedProgress();

		await expect(syncQuestionCounterCopies(NOW)).resolves.toEqual({ checked: 1, updated: 0 });
	});
});
