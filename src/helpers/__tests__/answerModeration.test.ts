import { Role, Statement, StatementType } from '@freedi/shared-types';
import { AnswerHostContext, canSeeAnswer, isHostOfAnswer } from '../answerModeration';

const QUESTION = 'question-1';
const TOP = 'top-1';
const AUTHOR = 'author-1';

function answer(fields: object = {}): Statement {
	return {
		statementId: 'answer-1',
		statementType: StatementType.option,
		parentId: QUESTION,
		topParentId: TOP,
		creatorId: AUTHOR,
		hide: true,
		...fields,
	} as unknown as Statement;
}

function viewer(fields: Partial<AnswerHostContext> = {}): AnswerHostContext {
	return {
		userId: 'someone-else',
		isSystemAdmin: false,
		subscriptionsByStatementId: new Map(),
		...fields,
	};
}

const adminOf = (statementId: string, role: Role = Role.admin): Partial<AnswerHostContext> => ({
	subscriptionsByStatementId: new Map([[statementId, { role }]]),
});

describe('isHostOfAnswer', () => {
	it.each([
		['an admin of the question', adminOf(QUESTION)],
		['an admin of the top parent', adminOf(TOP)],
		['the creator role on the question', adminOf(QUESTION, Role.creator)],
		['a system admin', { isSystemAdmin: true }],
	])('accepts %s', (_label, fields) => {
		expect(isHostOfAnswer(answer(), viewer(fields))).toBe(true);
	});

	it('refuses a plain member of the question', () => {
		expect(isHostOfAnswer(answer(), viewer(adminOf(QUESTION, Role.member)))).toBe(false);
	});

	it('refuses an author who is only an admin of their own answer', () => {
		expect(isHostOfAnswer(answer(), viewer(adminOf('answer-1')))).toBe(false);
	});
});

describe('canSeeAnswer', () => {
	it('hides a hidden answer from other participants', () => {
		expect(canSeeAnswer(answer(), viewer(), true)).toBe(false);
	});

	it('shows a hidden answer to its author', () => {
		expect(canSeeAnswer(answer(), viewer({ userId: AUTHOR }), false)).toBe(true);
	});

	it('follows the "show hidden" switch for hosts', () => {
		expect(canSeeAnswer(answer(), viewer(adminOf(QUESTION)), true)).toBe(true);
		expect(canSeeAnswer(answer(), viewer(adminOf(QUESTION)), false)).toBe(false);
	});

	it('leaves a visible answer alone', () => {
		expect(canSeeAnswer(answer({ hide: false }), viewer(), false)).toBe(true);
	});

	it('does not filter a hidden chat message', () => {
		expect(canSeeAnswer(answer({ statementType: StatementType.statement }), viewer(), false)).toBe(
			true,
		);
	});
});
