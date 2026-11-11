import { StatementType } from '@freedi/shared-types';
import {
	canDeleteNode,
	canEditNode,
	getAddLabelKey,
	getChildAddLabelKey,
	getNewNodeText,
	getNewNodeTextKey,
	getSiblingAddLabelKey,
} from '../nodeMenuLabels';

jest.mock('@/controllers/db/statements/setStatements', () => ({ saveStatementToDB: jest.fn() }));
jest.mock('@/controllers/db/statements/updateStatementFields', () => ({
	updateStatementText: jest.fn(),
}));
jest.mock('@/redux/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/redux/statements/statementsSlice', () => ({ setStatement: jest.fn() }));

describe('nodeMenuLabels', () => {
	describe('getAddLabelKey', () => {
		it('names the type that gets created', () => {
			expect(getAddLabelKey(StatementType.question)).toBe('Add Question');
			expect(getAddLabelKey(StatementType.option)).toBe('question.sheet.add');
			expect(getAddLabelKey(StatementType.group)).toBe('question.sheet.createSpace');
		});

		it('falls back to a plain Add for anything else', () => {
			expect(getAddLabelKey(StatementType.statement)).toBe('Add');
			expect(getAddLabelKey(null)).toBe('Add');
			expect(getAddLabelKey(undefined)).toBe('Add');
		});
	});

	describe('by node', () => {
		it('group: child adds a question, sibling creates a space', () => {
			expect(getChildAddLabelKey(StatementType.group)).toBe('Add Question');
			expect(getSiblingAddLabelKey(StatementType.group)).toBe('question.sheet.createSpace');
		});

		it('question: child adds an answer, sibling adds a question', () => {
			expect(getChildAddLabelKey(StatementType.question)).toBe('question.sheet.add');
			expect(getSiblingAddLabelKey(StatementType.question)).toBe('Add Question');
		});

		it('option: sibling adds an answer, no child to name', () => {
			expect(getSiblingAddLabelKey(StatementType.option)).toBe('question.sheet.add');
			expect(getChildAddLabelKey(StatementType.option)).toBe('Add');
		});
	});

	describe('getNewNodeTextKey', () => {
		it('maps each created type to a translated starting text', () => {
			expect(getNewNodeTextKey(StatementType.question)).toBe('map.node.newQuestion');
			expect(getNewNodeTextKey(StatementType.option)).toBe('map.node.newAnswer');
			expect(getNewNodeTextKey(StatementType.group)).toBe('New space');
			expect(getNewNodeTextKey(StatementType.statement)).toBeUndefined();
		});
	});

	describe('getNewNodeText', () => {
		const t = (key: string): string => `t:${key}`;

		it('translates the starting text', () => {
			expect(getNewNodeText(StatementType.option, t)).toBe('t:map.node.newAnswer');
		});

		it('leaves other types to the built-in default', () => {
			expect(getNewNodeText(StatementType.statement, t)).toBeUndefined();
			expect(getNewNodeText(null, t)).toBeUndefined();
		});
	});

	describe('permissions', () => {
		it('lets only an admin or the author edit', () => {
			expect(canEditNode({ isAdmin: true, isAuthor: false })).toBe(true);
			expect(canEditNode({ isAdmin: false, isAuthor: true })).toBe(true);
			expect(canEditNode({ isAdmin: false, isAuthor: false })).toBe(false);
		});

		it('lets an admin or author delete a plain node', () => {
			const base = { isRoot: false, statementType: StatementType.option };
			expect(canDeleteNode({ ...base, isAdmin: true, isAuthor: false })).toBe(true);
			expect(canDeleteNode({ ...base, isAdmin: false, isAuthor: true })).toBe(true);
			expect(canDeleteNode({ ...base, isAdmin: false, isAuthor: false })).toBe(false);
		});

		it('never deletes the root or a space', () => {
			expect(
				canDeleteNode({
					isAdmin: true,
					isAuthor: true,
					isRoot: true,
					statementType: StatementType.question,
				}),
			).toBe(false);
			expect(
				canDeleteNode({
					isAdmin: true,
					isAuthor: true,
					isRoot: false,
					statementType: StatementType.group,
				}),
			).toBe(false);
		});
	});
});
