import { EvaluationUI, Role, SortType, Statement, StatementType } from '@freedi/shared-types';
import {
	buildQuestionSegments,
	canParticipantsAddAnswers,
	canSeeResults,
	getAddAnswerState,
	getSortChips,
	isAddAnswerEnabled,
	isHostRole,
	resolveQuestionTab,
	canMakeAnswer,
} from '../questionScreenLogic';

jest.mock('@/controllers/general/helpers', () => ({
	isStatementTypeAllowedAsChildren: (parent: { statementType: string }, child: string): boolean => {
		if (parent.statementType === 'question') return child === 'option' || child === 'question';
		if (parent.statementType === 'group') return child === 'question';

		return false;
	},
}));

const LABELS = {
	chat: 'Discussion',
	options: 'Answers',
	results: 'Results',
	questions: 'Follow-ups',
	agreement: 'Agreement',
};

function question(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'q1',
		statement: 'Q',
		statementType: StatementType.question,
		parentId: 'top',
		topParentId: 'q1',
		creatorId: 'u1',
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...overrides,
	} as Statement;
}

describe('questionScreenLogic', () => {
	describe('isHostRole', () => {
		it.each([
			[Role.admin, true],
			[Role.creator, true],
			[Role.member, false],
			[Role.unsubscribed, false],
			[undefined, false],
		])('%s → %s', (role, expected) => {
			expect(isHostRole(role)).toBe(expected);
		});
	});

	describe('add-answer state matrix', () => {
		it.each([
			[{ isHost: false, canParticipantsAdd: true, isHalted: false }, 'open', true],
			[{ isHost: true, canParticipantsAdd: true, isHalted: false }, 'open', true],
			[{ isHost: false, canParticipantsAdd: false, isHalted: false }, 'closed', false],
			[{ isHost: true, canParticipantsAdd: false, isHalted: false }, 'host-only', true],
			[{ isHost: false, canParticipantsAdd: true, isHalted: true }, 'halted', false],
			[{ isHost: true, canParticipantsAdd: true, isHalted: true }, 'halted', false],
		])('%o → %s (enabled=%s)', (input, state, enabled) => {
			expect(getAddAnswerState(input)).toBe(state);
			expect(isAddAnswerEnabled(getAddAnswerState(input))).toBe(enabled);
		});

		it('reads the flag that matches the rating UI, exactly like the legacy nav', () => {
			expect(
				canParticipantsAddAnswers(
					question({
						evaluationSettings: { evaluationUI: EvaluationUI.suggestions },
						statementSettings: { enableAddEvaluationOption: true },
					} as Partial<Statement>),
				),
			).toBe(true);
			expect(
				canParticipantsAddAnswers(
					question({
						evaluationSettings: { evaluationUI: EvaluationUI.voting },
						statementSettings: { enableAddEvaluationOption: true },
					} as Partial<Statement>),
				),
			).toBe(false);
			expect(
				canParticipantsAddAnswers(
					question({
						evaluationSettings: { evaluationUI: EvaluationUI.voting },
						statementSettings: { enableAddVotingOption: true },
					} as Partial<Statement>),
				),
			).toBe(true);
			expect(canParticipantsAddAnswers(undefined)).toBe(false);
		});
	});

	describe('buildQuestionSegments', () => {
		const counts = { chat: 3, options: 2, questions: 0 };

		it('always has Discussion; Answers + Results when answers are allowed', () => {
			const ids = buildQuestionSegments({
				statement: question(),
				isHost: false,
				counts,
				labels: LABELS,
			}).map((s) => s.id);
			expect(ids).toEqual(['chat', 'options', 'results']);
		});

		it('shows Agreement to a host, and to a participant only once a covenant exists', () => {
			const participant = buildQuestionSegments({
				statement: question(),
				isHost: false,
				counts,
				labels: LABELS,
			}).map((s) => s.id);
			expect(participant).not.toContain('agreement');
			const withCovenant = buildQuestionSegments({
				statement: question(),
				isHost: false,
				counts,
				labels: LABELS,
				hasCovenant: true,
			}).map((s) => s.id);
			expect(withCovenant).toEqual(['chat', 'options', 'results', 'agreement']);
			const host = buildQuestionSegments({
				statement: question(),
				isHost: true,
				counts,
				labels: LABELS,
			}).map((s) => s.id);
			expect(host).toContain('agreement');
			expect(host.indexOf('agreement')).toBeLessThan(host.indexOf('questions'));
		});

		it('shows Follow-ups to a participant only when there is at least one', () => {
			const withOne = buildQuestionSegments({
				statement: question(),
				isHost: false,
				counts: { ...counts, questions: 1 },
				labels: LABELS,
			});
			expect(withOne.map((s) => s.id)).toContain('questions');
		});

		it('shows Follow-ups to a host even when empty, unless the setting forbids adding', () => {
			expect(
				buildQuestionSegments({ statement: question(), isHost: true, counts, labels: LABELS }).map(
					(s) => s.id,
				),
			).toContain('questions');
			expect(
				buildQuestionSegments({
					statement: question({
						statementSettings: { enableAddNewSubQuestionsButton: false },
					} as Partial<Statement>),
					isHost: true,
					counts,
					labels: LABELS,
				}).map((s) => s.id),
			).not.toContain('questions');
		});

		it('a space (group) has no Answers tab', () => {
			const ids = buildQuestionSegments({
				statement: question({ statementType: StatementType.group }),
				isHost: false,
				counts: { ...counts, questions: 2 },
				labels: LABELS,
			}).map((s) => s.id);
			expect(ids).toEqual(['chat', 'questions']);
		});
	});

	describe('resolveQuestionTab', () => {
		it.each([
			['results', 'chat', 'results'],
			['agreement-map', 'chat', 'results'],
			['polarization-index', 'options', 'results'],
			['vote', 'chat', 'options'],
			['options', 'chat', 'options'],
			['mind-map', 'options', 'options'],
			[undefined, 'questions', 'questions'],
		] as const)('%s (fallback %s) → %s', (view, fallback, expected) => {
			expect(resolveQuestionTab(view, fallback)).toBe(expected);
		});
	});

	describe('getSortChips', () => {
		it('drops Agreement without live results and swaps Updated for Joined when joining is on', () => {
			const base = getSortChips(question()).map((c) => c.id);
			expect(base).toEqual([
				SortType.newest,
				SortType.mostUpdated,
				SortType.random,
				SortType.accepted,
			]);

			const noResults = getSortChips(
				question({ statementSettings: { showEvaluation: false } } as Partial<Statement>),
			).map((c) => c.id);
			expect(noResults).not.toContain(SortType.accepted);

			const joining = getSortChips(
				question({ statementSettings: { joiningEnabled: true } } as Partial<Statement>),
			).map((c) => c.id);
			expect(joining).toContain(SortType.mostJoined);
			expect(joining).not.toContain(SortType.mostUpdated);
		});
	});

	describe('canSeeResults', () => {
		it('hosts always, participants after live results or the deadline', () => {
			expect(canSeeResults({ isHost: true, showLiveResults: false, isDeadlinePassed: false })).toBe(
				true,
			);
			expect(
				canSeeResults({ isHost: false, showLiveResults: false, isDeadlinePassed: false }),
			).toBe(false);
			expect(canSeeResults({ isHost: false, showLiveResults: true, isDeadlinePassed: false })).toBe(
				true,
			);
			expect(canSeeResults({ isHost: false, showLiveResults: false, isDeadlinePassed: true })).toBe(
				true,
			);
		});
	});
});

describe('canMakeAnswer', () => {
	const question = {
		statementId: 'q1',
		statementType: StatementType.question,
		statementSettings: {},
	} as unknown as Statement;
	const message = { statementId: 'm1', statementType: StatementType.statement } as Statement;

	it('allows a plain message under a question for an authorised viewer', () => {
		expect(
			canMakeAnswer({ statement: message, parent: question, isAuthorized: true, isHalted: false }),
		).toBe(true);
	});

	it('refuses without a parent, without authorisation, when halted, or for a non-message', () => {
		expect(
			canMakeAnswer({ statement: message, parent: undefined, isAuthorized: true, isHalted: false }),
		).toBe(false);
		expect(
			canMakeAnswer({ statement: message, parent: question, isAuthorized: false, isHalted: false }),
		).toBe(false);
		expect(
			canMakeAnswer({ statement: message, parent: question, isAuthorized: true, isHalted: true }),
		).toBe(false);
		expect(
			canMakeAnswer({
				statement: { ...message, statementType: StatementType.option } as Statement,
				parent: question,
				isAuthorized: true,
				isHalted: false,
			}),
		).toBe(false);
	});
});
