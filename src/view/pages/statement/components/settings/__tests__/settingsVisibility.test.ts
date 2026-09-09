import { QuestionType, SortType, Statement, StatementType } from '@freedi/shared-types';
import { hasNonDefaultAdvancedValue, isAdvancedGroupVisible } from '../settingsVisibility';

function make(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'q1',
		topParentId: 'q1',
		parentId: 'top',
		statement: 'Q',
		statementType: StatementType.question,
		creator: { uid: 'u', displayName: 'U' },
		creatorId: 'u',
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...overrides,
	} as Statement;
}

describe('isAdvancedGroupVisible', () => {
	it('is hidden for a plain user on a fresh question', () => {
		expect(isAdvancedGroupVisible({ statement: make(), advanceUser: false })).toBe(false);
		expect(isAdvancedGroupVisible({ statement: make(), advanceUser: undefined })).toBe(false);
	});

	it('is shown for an advanced user regardless of values', () => {
		expect(isAdvancedGroupVisible({ statement: make(), advanceUser: true })).toBe(true);
	});

	it.each<[string, Partial<Statement>]>([
		['question type', { questionSettings: { questionType: QuestionType.compound } }],
		['nightly backup', { questionSettings: { autoBackup: true } }],
		['hidden', { hide: true }],
		['document', { isDocument: true }],
		['tree view', { statementSettings: { enableTreeView: true } }],
		['sub-questions map off', { statementSettings: { enableSubQuestionsMap: false } }],
		['default view', { statementSettings: { defaultView: 'options' } }],
		['default sort', { statementSettings: { defaultSortType: SortType.random } }],
		['forced language', { forceLanguage: true, defaultLanguage: 'he' }],
	])('is shown when %s is customised', (_label, overrides) => {
		const statement = make(overrides as Partial<Statement>);
		expect(hasNonDefaultAdvancedValue(statement)).toBe(true);
		expect(isAdvancedGroupVisible({ statement, advanceUser: false })).toBe(true);
	});

	it('treats values explicitly set to their default as default', () => {
		const statement = make({
			hide: false,
			statementSettings: { enableSubQuestionsMap: true, defaultView: 'chat' },
			questionSettings: { questionType: QuestionType.multiStage },
		});
		expect(hasNonDefaultAdvancedValue(statement)).toBe(false);
	});
});
