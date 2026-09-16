import {
	QuestionStep,
	Role,
	Statement,
	StatementSubscription,
	StatementType,
} from '@freedi/shared-types';
import {
	buildHomeModel,
	filterHomeQuestions,
	filterHomeSpaces,
	formatClosing,
	formatQuestionMeta,
	formatSpaceMeta,
	HomeQuestion,
	stageForStep,
	toneForIndex,
} from '../homeModel';

const HE: Record<string, string> = {
	'One question': 'שאלה אחת',
	'{n} questions': '{n} שאלות',
	'One open': 'פתוחה אחת',
	'{n} open': '{n} פתוחות',
	'All decided': 'הכול הוחלט',
	'No questions yet': 'עדיין אין שאלות',
	Collecting: 'אוספים',
	Rating: 'מדרגים',
	'Voting stage': 'מצביעים',
	Decided: 'הוחלט',
	Closed: 'נסגר',
	'Closes {date}': 'נסגר {date}',
};
const t = (key: string): string => HE[key] ?? key;

function statement(partial: Partial<Statement> & { statementId: string }): Statement {
	return {
		statement: partial.statementId,
		parentId: 'top',
		topParentId: 'top',
		statementType: StatementType.question,
		creatorId: 'someone',
		...partial,
	} as Statement;
}

function sub(s: Statement, extra: Partial<StatementSubscription> = {}): StatementSubscription {
	return {
		userId: 'u1',
		statementId: s.statementId,
		parentId: s.parentId,
		statementType: s.statementType,
		statement: s,
		role: Role.member,
		...extra,
	} as StatementSubscription;
}

describe('formatSpaceMeta — Hebrew number agreement', () => {
	it('uses the singular forms for one', () => {
		expect(formatSpaceMeta(1, 1, t)).toBe('שאלה אחת · פתוחה אחת');
	});

	it('uses plural forms with the count', () => {
		expect(formatSpaceMeta(3, 2, t)).toBe('3 שאלות · 2 פתוחות');
	});

	it('says everything is decided when nothing is open', () => {
		expect(formatSpaceMeta(4, 0, t)).toBe('4 שאלות · הכול הוחלט');
	});

	it('never renders "0 שאלות"', () => {
		expect(formatSpaceMeta(0, 0, t)).toBe('עדיין אין שאלות');
	});
});

describe('stageForStep', () => {
	it.each([
		[QuestionStep.explanation, 'collecting'],
		[QuestionStep.suggestion, 'collecting'],
		[QuestionStep.randomEvaluation, 'rating'],
		[QuestionStep.topEvaluation, 'rating'],
		[QuestionStep.voting, 'voting'],
		[QuestionStep.finished, 'decided'],
	])('maps %s to %s', (step, stage) => {
		expect(stageForStep(step)).toBe(stage);
	});

	it('leaves the stage out when there is no known step', () => {
		expect(stageForStep(undefined)).toBeUndefined();
		expect(stageForStep(QuestionStep.other)).toBeUndefined();
	});
});

describe('toneForIndex', () => {
	it('cycles lilac, mint, yellow', () => {
		expect([0, 1, 2, 3].map(toneForIndex)).toEqual(['lilac', 'mint', 'yellow', 'lilac']);
	});
});

describe('formatClosing / formatQuestionMeta', () => {
	const now = Date.UTC(2026, 8, 15);

	it('omits closing without a deadline', () => {
		expect(formatClosing(undefined, now, 'he', t)).toBeUndefined();
	});

	it('says closed once the deadline passed', () => {
		expect(formatClosing(now - 1, now, 'he', t)).toBe('נסגר');
	});

	it('shows the date for a future deadline', () => {
		expect(formatClosing(now + 86400000, now, 'en', t)).toMatch(/^נסגר .*16/);
	});

	it('joins space, stage and closing, skipping missing parts', () => {
		const question: HomeQuestion = {
			id: 'q',
			title: 'Q',
			spaceTitle: 'ועד השכונה',
			tone: 'mint',
			stage: 'rating',
			hosting: false,
		};
		expect(formatQuestionMeta(question, now, 'he', t)).toBe('ועד השכונה · מדרגים');
		expect(
			formatQuestionMeta({ ...question, spaceTitle: undefined, stage: undefined }, now, 'he', t),
		).toBe('');
	});
});

describe('buildHomeModel', () => {
	const space = statement({
		statementId: 's1',
		statement: 'Neighbours',
		statementType: StatementType.group,
	});
	const other = statement({
		statementId: 's2',
		statement: 'Parents',
		statementType: StatementType.group,
		creatorId: 'u1',
	});
	const q1 = statement({
		statementId: 'q1',
		statement: 'Bike path',
		parentId: 's1',
		topParentId: 's1',
		questionSettings: {
			currentStep: QuestionStep.randomEvaluation,
			deadline: 42,
		} as Statement['questionSettings'],
	});
	const q2 = statement({
		statementId: 'q2',
		statement: 'Garden hours',
		parentId: 's1',
		topParentId: 's1',
		questionSettings: { currentStep: QuestionStep.finished } as Statement['questionSettings'],
	});
	const unsubscribed = statement({ statementId: 'q3', parentId: 's1', topParentId: 's1' });
	const topChat = statement({
		statementId: 'c1',
		statement: 'Open chat',
		statementType: StatementType.statement,
	});
	const option = statement({
		statementId: 'o1',
		parentId: 'q1',
		topParentId: 's1',
		statementType: StatementType.option,
	});

	const model = buildHomeModel({
		subscriptions: [
			sub(space, { role: Role.admin }),
			sub(other),
			sub(q1),
			sub(q2),
			sub(topChat),
			sub(option),
			sub(q1),
			sub(statement({ statementId: 'x' }), { userId: 'someone-else' }),
		],
		statements: [unsubscribed],
		userId: 'u1',
	});

	it('lists top-level groups as tinted spaces with host flags', () => {
		expect(model.spaces.map((s) => [s.id, s.tone, s.hosting])).toEqual([
			['s1', 'lilac', true],
			['s2', 'mint', true],
		]);
	});

	it('counts subscribed and loaded questions per space', () => {
		expect(model.spaces[0]).toMatchObject({ questionCount: 3, openCount: 2 });
		expect(model.spaces[1]).toMatchObject({ questionCount: 0, openCount: 0 });
	});

	it('lists questions and top-level conversations, never options or duplicates', () => {
		expect(model.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'c1']);
	});

	it('carries space, tone, stage and deadline onto each question', () => {
		expect(model.questions[0]).toMatchObject({
			spaceId: 's1',
			spaceTitle: 'Neighbours',
			tone: 'lilac',
			stage: 'rating',
			deadline: 42,
		});
		expect(model.questions[2]).toMatchObject({ tone: 'sunken', spaceId: undefined });
	});
});

describe('filterHomeQuestions / filterHomeSpaces', () => {
	const questions: HomeQuestion[] = [
		{
			id: 'a',
			title: 'Bike path',
			spaceId: 's1',
			spaceTitle: 'Neighbours',
			tone: 'lilac',
			hosting: true,
		},
		{
			id: 'b',
			title: 'Budget',
			spaceId: 's2',
			spaceTitle: 'Parents',
			tone: 'mint',
			hosting: false,
		},
		{ id: 'c', title: 'Garden', tone: 'sunken', hosting: false },
	];

	it('matches the title or the space name, case-insensitively', () => {
		expect(filterHomeQuestions(questions, { term: 'BIKE' }).map((q) => q.id)).toEqual(['a']);
		expect(filterHomeQuestions(questions, { term: 'parent' }).map((q) => q.id)).toEqual(['b']);
	});

	it('filters by space and by hosting', () => {
		expect(filterHomeQuestions(questions, { spaceId: 's2' }).map((q) => q.id)).toEqual(['b']);
		expect(filterHomeQuestions(questions, { hostOnly: true }).map((q) => q.id)).toEqual(['a']);
	});

	it('returns everything for an empty filter', () => {
		expect(filterHomeQuestions(questions, { term: '  ' })).toHaveLength(3);
	});

	it('filters spaces by name', () => {
		const spaces = [
			{
				id: 's1',
				title: 'Neighbours',
				tone: 'lilac' as const,
				questionCount: 1,
				openCount: 1,
				hosting: false,
			},
			{
				id: 's2',
				title: 'Parents',
				tone: 'mint' as const,
				questionCount: 1,
				openCount: 0,
				hosting: false,
			},
		];
		expect(filterHomeSpaces(spaces, 'nei').map((s) => s.id)).toEqual(['s1']);
		expect(filterHomeSpaces(spaces, '')).toHaveLength(2);
	});
});
