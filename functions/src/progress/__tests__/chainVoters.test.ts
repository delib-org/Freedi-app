import { Collections, getQuestionParticipationId } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from './fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../../db', () => ({
	get db() {
		return fake.db;
	},
}));

import { clearChainCache, refreshChainVoters } from '../chainVoters';

const TOP = 'top-question';
const SUB = 'sub-question';
const SIBLING = 'sibling-question';

/** A question at `id` whose parent is `parentId` ('top' means no parent). */
const seedQuestion = (id: string, parentId: string): void => {
	fake.seed(Collections.statements, id, { statementId: id, parentId, topParentId: TOP });
};

/** Records that `userId` evaluated something under `questionId`. */
const seedVoter = (questionId: string, userId: string): void => {
	fake.seed(Collections.questionParticipation, getQuestionParticipationId(questionId, userId), {
		statementId: questionId,
		userId,
		evaluated: true,
	});
};

const seedProgress = (questionId: string, evaluated: number): void => {
	fake.seed(Collections.questionProgress, questionId, { statementId: questionId, evaluated });
};

const chainCount = (questionId: string): unknown =>
	fake.read(Collections.questionProgress, questionId)?.chainEvaluated;

const mirroredOnStatement = (questionId: string): unknown => {
	const evaluation = fake.read(Collections.statements, questionId)?.evaluation as
		| Record<string, unknown>
		| undefined;

	return evaluation?.chainEvaluators;
};

beforeEach(() => {
	fake = createFakeDb();
	clearChainCache();
	seedQuestion(TOP, 'top');
	seedQuestion(SUB, TOP);
	seedQuestion(SIBLING, TOP);
});

describe('refreshChainVoters', () => {
	it('counts the voters of a question with no ancestors', async () => {
		seedProgress(TOP, 2);
		seedVoter(TOP, 'ada');
		seedVoter(TOP, 'grace');

		expect(await refreshChainVoters(TOP)).toBe(2);
		expect(chainCount(TOP)).toBe(2);
	});

	it('mirrors the count onto the statement for the evaluation trigger to read', async () => {
		// The trigger already holds the parent document, so putting the number
		// there is what makes N free at the point it is used.
		seedProgress(TOP, 2);
		seedVoter(TOP, 'ada');
		seedVoter(TOP, 'grace');

		await refreshChainVoters(TOP);

		expect(mirroredOnStatement(TOP)).toBe(2);
	});

	it('inherits the voters of the question above', async () => {
		seedProgress(TOP, 2);
		seedVoter(TOP, 'ada');
		seedVoter(TOP, 'grace');
		seedProgress(SUB, 1);
		seedVoter(SUB, 'linus');

		expect(await refreshChainVoters(SUB)).toBe(3);
	});

	it('counts somebody who voted at both levels once', async () => {
		// The reason this is a union and not a sum.
		seedProgress(TOP, 2);
		seedVoter(TOP, 'ada');
		seedVoter(TOP, 'grace');
		seedProgress(SUB, 1);
		seedVoter(SUB, 'ada');

		expect(await refreshChainVoters(SUB)).toBe(2);
	});

	it('never inherits from a sibling branch', async () => {
		// Voting in one question of a group does not give you standing in
		// another question of that group you never opened.
		seedProgress(SIBLING, 5);
		for (const uid of ['a', 'b', 'c', 'd', 'e']) seedVoter(SIBLING, uid);
		seedProgress(SUB, 1);
		seedVoter(SUB, 'linus');

		expect(await refreshChainVoters(SUB)).toBe(1);
	});

	it('leaves no count when nobody has voted anywhere in the chain', async () => {
		// Zero is not an electorate of nobody, it is the absence of one — and a
		// stored zero would be read as a census and hand out a perfect score.
		seedProgress(TOP, 0);

		expect(await refreshChainVoters(TOP)).toBe(0);
		expect(mirroredOnStatement(TOP)).toBeUndefined();
	});

	it('skips the recount while the chain counters are unchanged', async () => {
		seedProgress(TOP, 2);
		seedVoter(TOP, 'ada');
		seedVoter(TOP, 'grace');
		seedProgress(SUB, 1);
		seedVoter(SUB, 'linus');
		await refreshChainVoters(SUB);

		// Markers vanish; only an actual recount could notice. The fingerprint
		// has not moved, so the stored number stands.
		fake.store.get(Collections.questionParticipation)?.clear();

		expect(await refreshChainVoters(SUB)).toBe(3);
		expect(chainCount(SUB)).toBe(3);
	});

	it('recounts once a chain counter moves', async () => {
		seedProgress(TOP, 2);
		seedVoter(TOP, 'ada');
		seedVoter(TOP, 'grace');
		seedProgress(SUB, 1);
		seedVoter(SUB, 'linus');
		await refreshChainVoters(SUB);

		// A new voter arrives in the question ABOVE, which never touches SUB.
		seedProgress(TOP, 3);
		seedVoter(TOP, 'edsger');

		expect(await refreshChainVoters(SUB)).toBe(4);
	});

	it('ignores markers for people who only entered or suggested', async () => {
		seedProgress(TOP, 1);
		seedVoter(TOP, 'ada');
		fake.seed(Collections.questionParticipation, getQuestionParticipationId(TOP, 'lurker'), {
			statementId: TOP,
			userId: 'lurker',
			entered: true,
		});
		seedProgress(SUB, 1);
		seedVoter(SUB, 'linus');

		expect(await refreshChainVoters(SUB)).toBe(2);
	});

	it('ignores the "top" sentinel', async () => {
		expect(await refreshChainVoters('top')).toBeUndefined();
	});
});
