import { QuestionType, Statement, StatementType } from '@freedi/shared-types';
import {
	buildQuestionTabs,
	getDefaultQuestionTab,
	resolveActiveView,
	resolveTabParam,
	tabOfView,
} from '../questionTabs';

jest.mock('@/controllers/general/helpers', () => ({
	isStatementTypeAllowedAsChildren: (parent: { statementType: string }, child: string): boolean => {
		if (parent.statementType === 'option' || parent.statementType === 'group') {
			return child !== 'option';
		}

		return true;
	},
}));

function statement(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 's1',
		statement: 'S',
		statementType: StatementType.question,
		parentId: 'top',
		topParentId: 's1',
		creatorId: 'u1',
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...overrides,
	} as Statement;
}

const ids = (s: Statement | undefined): string[] =>
	buildQuestionTabs({ statement: s }).map((t) => t.id);

describe('questionTabs', () => {
	describe('buildQuestionTabs', () => {
		it('a question offers all six tabs in design order', () => {
			expect(ids(statement())).toEqual([
				'background',
				'chat',
				'options',
				'questions',
				'results',
				'maps',
			]);
		});

		it('a space (group) has discussion and questions only', () => {
			expect(ids(statement({ statementType: StatementType.group }))).toEqual(['chat', 'questions']);
		});

		it('an answer (option) has discussion and questions only', () => {
			expect(ids(statement({ statementType: StatementType.option }))).toEqual([
				'chat',
				'questions',
			]);
		});

		it('a compound question runs its phases on the discussion tab', () => {
			expect(
				ids(
					statement({
						questionSettings: { questionType: QuestionType.compound },
					} as Partial<Statement>),
				),
			).toEqual(['background', 'chat', 'results', 'maps']);
		});

		it('without a statement only discussion exists', () => {
			expect(ids(undefined)).toEqual(['chat']);
		});

		it('carries counts for the three list tabs and chat unread', () => {
			const tabs = buildQuestionTabs({
				statement: statement(),
				counts: { chat: 4, options: 7, questions: 2 },
				unreadChat: 3,
			});
			expect(tabs.find((t) => t.id === 'chat')).toMatchObject({ count: 4, unreadCount: 3 });
			expect(tabs.find((t) => t.id === 'options')?.count).toBe(7);
			expect(tabs.find((t) => t.id === 'results')?.count).toBeUndefined();
		});
	});

	describe('resolveTabParam (legacy links)', () => {
		it.each([
			['overview', 'results'],
			['summary', 'results'],
			['results', 'results'],
			['covenant', 'covenant'],
			['agreement', 'covenant'],
			['themes', 'themes'],
			['maps', 'maps'],
			['vote', 'options'],
			['main', 'chat'],
			['background', 'background'],
		])('?tab=%s → %s', (param, view) => {
			expect(resolveTabParam(param)).toBe(view);
		});

		it('unknown and empty values resolve to nothing', () => {
			expect(resolveTabParam('nope')).toBeUndefined();
			expect(resolveTabParam(null)).toBeUndefined();
		});

		it('sub-views highlight their parent tab', () => {
			expect(tabOfView('covenant')).toBe('results');
			expect(tabOfView('themes')).toBe('maps');
			expect(tabOfView('chat')).toBe('chat');
		});
	});

	describe('default tab', () => {
		it('lands a question on Answers', () => {
			const s = statement();
			expect(getDefaultQuestionTab(s, buildQuestionTabs({ statement: s }))).toBe('options');
		});

		it('respects an explicit defaultView, including legacy values', () => {
			const chat = statement({ statementSettings: { defaultView: 'chat' } } as Partial<Statement>);
			expect(getDefaultQuestionTab(chat, buildQuestionTabs({ statement: chat }))).toBe('chat');
			const overview = statement({
				statementSettings: { defaultView: 'overview' },
			} as Partial<Statement>);
			expect(getDefaultQuestionTab(overview, buildQuestionTabs({ statement: overview }))).toBe(
				'results',
			);
		});

		it('ignores a defaultView whose tab is not offered', () => {
			const group = statement({
				statementType: StatementType.group,
				statementSettings: { defaultView: 'options' },
			} as Partial<Statement>);
			expect(getDefaultQuestionTab(group, buildQuestionTabs({ statement: group }))).toBe('chat');
		});
	});

	describe('resolveActiveView', () => {
		it('keeps an offered request (including sub-views) and falls back otherwise', () => {
			const s = statement();
			const tabs = buildQuestionTabs({ statement: s });
			expect(resolveActiveView('covenant', s, tabs)).toBe('covenant');
			expect(resolveActiveView('summary', s, tabs)).toBe('results');
			expect(resolveActiveView(null, s, tabs)).toBe('options');
			const group = statement({ statementType: StatementType.group });
			expect(resolveActiveView('results', group, buildQuestionTabs({ statement: group }))).toBe(
				'chat',
			);
		});
	});
});
