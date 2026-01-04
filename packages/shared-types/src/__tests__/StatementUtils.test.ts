/**
 * Tests for StatementUtils - statement creation utilities
 */

import { StatementType } from '../models/TypeEnums';
import { Role } from '../models/user/UserSettings';
import { StageSelectionType } from '../models/stage/stageTypes';

// Mock valibot
jest.mock('valibot', () => ({
	parse: jest.fn((schema, data) => data),
	safeParse: jest.fn((schema, data) => ({ success: true, output: data })),
}));

// Mock getRandomUID to return predictable values
jest.mock('../models/TypeUtils', () => ({
	getRandomUID: jest.fn(() => 'mock-uid-12'),
}));

import {
	createStatementObject,
	createBasicStatement,
	defaultStatementSettings,
	CreateStatementParams,
} from '../models/statement/StatementUtils';
import { safeParse } from 'valibot';
import { getRandomUID } from '../models/TypeUtils';
import { User } from '../models/user/User';
import { Statement } from '../models/statement/StatementTypes';

describe('StatementUtils', () => {
	const mockUser: User = {
		uid: 'user-123',
		displayName: 'Test User',
		email: 'test@example.com',
		photoURL: '',
		isAnonymous: false,
	};

	const baseParams: CreateStatementParams = {
		statement: 'Test statement content',
		statementType: StatementType.option,
		parentId: 'parent-123',
		creatorId: 'user-123',
		creator: mockUser,
	};

	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
		jest.spyOn(Math, 'random').mockReturnValue(0.5);
		jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('defaultStatementSettings', () => {
		it('should have correct default values', () => {
			expect(defaultStatementSettings.showEvaluation).toBe(true);
			expect(defaultStatementSettings.enableAddEvaluationOption).toBe(true);
			expect(defaultStatementSettings.enableAddVotingOption).toBe(true);
			expect(defaultStatementSettings.enableSimilaritiesSearch).toBe(true);
			expect(defaultStatementSettings.enableNavigationalElements).toBe(true);
		});
	});

	describe('createStatementObject', () => {
		it('should create a valid statement with minimal params', () => {
			const result = createStatementObject(baseParams);

			expect(result).toBeDefined();
			expect(result?.statement).toBe('Test statement content');
			expect(result?.statementType).toBe(StatementType.option);
			expect(result?.parentId).toBe('parent-123');
			expect(result?.creatorId).toBe('user-123');
		});

		it('should generate statementId when not provided', () => {
			const result = createStatementObject(baseParams);

			expect(result?.statementId).toBe('mock-uid-12');
			expect(getRandomUID).toHaveBeenCalled();
		});

		it('should use provided statementId when given', () => {
			const params = { ...baseParams, statementId: 'custom-id' };
			const result = createStatementObject(params);

			expect(result?.statementId).toBe('custom-id');
		});

		it('should set topParentId from params', () => {
			const params = { ...baseParams, topParentId: 'top-parent-123' };
			const result = createStatementObject(params);

			expect(result?.topParentId).toBe('top-parent-123');
		});

		it('should use parentId as topParentId when not provided', () => {
			const result = createStatementObject(baseParams);

			expect(result?.topParentId).toBe('parent-123');
		});

		it('should set timestamps correctly', () => {
			const result = createStatementObject(baseParams);

			expect(result?.createdAt).toBe(1700000000000);
			expect(result?.lastUpdate).toBe(1700000000000);
		});

		it('should set default consensus to 0', () => {
			const result = createStatementObject(baseParams);

			expect(result?.consensus).toBe(0);
		});

		it('should use provided consensus value', () => {
			const params = { ...baseParams, consensus: 0.75 };
			const result = createStatementObject(params);

			expect(result?.consensus).toBe(0.75);
		});

		it('should set default statementSettings', () => {
			const result = createStatementObject(baseParams);

			expect(result?.statementSettings).toEqual(defaultStatementSettings);
		});

		it('should use provided statementSettings', () => {
			const customSettings = {
				showEvaluation: false,
				enableAddEvaluationOption: false,
				enableAddVotingOption: false,
				enableSimilaritiesSearch: false,
				enableNavigationalElements: false,
			};
			const params = { ...baseParams, statementSettings: customSettings };
			const result = createStatementObject(params);

			expect(result?.statementSettings).toEqual(customSettings);
		});

		it('should set default stageSelectionType to consensus', () => {
			const result = createStatementObject(baseParams);

			expect(result?.stageSelectionType).toBe(StageSelectionType.consensus);
		});

		it('should use provided stageSelectionType', () => {
			const params = {
				...baseParams,
				stageSelectionType: StageSelectionType.voting,
			};
			const result = createStatementObject(params);

			expect(result?.stageSelectionType).toBe(StageSelectionType.voting);
		});

		it('should generate randomSeed when not provided', () => {
			const result = createStatementObject(baseParams);

			expect(result?.randomSeed).toBe(0.5);
		});

		it('should use provided randomSeed', () => {
			const params = { ...baseParams, randomSeed: 0.123 };
			const result = createStatementObject(params);

			expect(result?.randomSeed).toBe(0.123);
		});

		it('should set hide to false by default', () => {
			const result = createStatementObject(baseParams);

			expect(result?.hide).toBe(false);
		});

		it('should use provided hide value', () => {
			const params = { ...baseParams, hide: true };
			const result = createStatementObject(params);

			expect(result?.hide).toBe(true);
		});

		it('should include color when provided', () => {
			const params = { ...baseParams, color: '#ff0000' };
			const result = createStatementObject(params);

			expect(result?.color).toBe('#ff0000');
		});

		it('should not include color when not provided', () => {
			const result = createStatementObject(baseParams);

			expect(result).not.toHaveProperty('color');
		});

		it('should set empty paragraphs array by default', () => {
			const result = createStatementObject(baseParams);

			expect(result?.paragraphs).toEqual([]);
		});

		it('should use provided paragraphs', () => {
			const paragraphs = [{ order: 0, content: 'paragraph 1' }] as any;
			const params = { ...baseParams, paragraphs };
			const result = createStatementObject(params);

			expect(result?.paragraphs).toEqual(paragraphs);
		});

		it('should set empty parents array by default', () => {
			const result = createStatementObject(baseParams);

			expect(result?.parents).toEqual([]);
		});

		it('should use provided parents array', () => {
			const parents = ['grandparent-id', 'parent-id'];
			const params = { ...baseParams, parents };
			const result = createStatementObject(params);

			expect(result?.parents).toEqual(parents);
		});

		it('should return undefined when validation fails', () => {
			(safeParse as jest.Mock).mockReturnValueOnce({
				success: false,
				issues: [{ message: 'validation error' }],
			});

			const result = createStatementObject(baseParams);

			expect(result).toBeUndefined();
			expect(console.error).toHaveBeenCalled();
		});

		it('should return undefined when an error is thrown', () => {
			(safeParse as jest.Mock).mockImplementationOnce(() => {
				throw new Error('Unexpected error');
			});

			const result = createStatementObject(baseParams);

			expect(result).toBeUndefined();
			expect(console.error).toHaveBeenCalled();
		});

		it('should work with all StatementTypes', () => {
			const types = [
				StatementType.statement,
				StatementType.option,
				StatementType.question,
				StatementType.document,
				StatementType.group,
				StatementType.comment,
			];

			types.forEach((type) => {
				const params = { ...baseParams, statementType: type };
				const result = createStatementObject(params);
				expect(result?.statementType).toBe(type);
			});
		});
	});

	describe('createBasicStatement', () => {
		const mockParentStatement: Statement = {
			statementId: 'parent-statement-id',
			statement: 'Parent statement',
			statementType: StatementType.question,
			parentId: 'grandparent-id',
			topParentId: 'top-parent-id',
			creatorId: 'creator-123',
			creator: mockUser,
			createdAt: 1699000000000,
			lastUpdate: 1699000000000,
			consensus: 0,
			paragraphs: [],
			parents: ['grandparent-id'],
			statementSettings: defaultStatementSettings,
			stageSelectionType: StageSelectionType.consensus,
			randomSeed: 0.5,
			hide: false,
		};

		it('should create statement from parent statement', () => {
			const result = createBasicStatement({
				parentStatement: mockParentStatement,
				user: mockUser,
				statement: 'Child statement',
			});

			expect(result).toBeDefined();
			expect(result?.statement).toBe('Child statement');
			expect(result?.parentId).toBe('parent-statement-id');
		});

		it('should use parent topParentId', () => {
			const result = createBasicStatement({
				parentStatement: mockParentStatement,
				user: mockUser,
				statement: 'Child statement',
			});

			expect(result?.topParentId).toBe('top-parent-id');
		});

		it('should fallback to parent statementId as topParentId', () => {
			const parentWithoutTopParent = {
				...mockParentStatement,
				topParentId: undefined,
			} as unknown as Statement;

			const result = createBasicStatement({
				parentStatement: parentWithoutTopParent,
				user: mockUser,
				statement: 'Child statement',
			});

			expect(result?.topParentId).toBe('parent-statement-id');
		});

		it('should copy parent parents array', () => {
			const result = createBasicStatement({
				parentStatement: mockParentStatement,
				user: mockUser,
				statement: 'Child statement',
			});

			expect(result?.parents).toEqual(['grandparent-id']);
		});

		it('should default to StatementType.statement', () => {
			const result = createBasicStatement({
				parentStatement: mockParentStatement,
				user: mockUser,
				statement: 'Child statement',
			});

			expect(result?.statementType).toBe(StatementType.statement);
		});

		it('should use provided statementType', () => {
			const result = createBasicStatement({
				parentStatement: mockParentStatement,
				user: mockUser,
				statement: 'Child statement',
				statementType: StatementType.option,
			});

			expect(result?.statementType).toBe(StatementType.option);
		});

		it('should use provided stageSelectionType', () => {
			const result = createBasicStatement({
				parentStatement: mockParentStatement,
				user: mockUser,
				statement: 'Child statement',
				stageSelectionType: StageSelectionType.voting,
			});

			expect(result?.stageSelectionType).toBe(StageSelectionType.voting);
		});

		it('should include paragraphs when provided', () => {
			const paragraphs = [{ order: 0, content: 'test' }] as any;
			const result = createBasicStatement({
				parentStatement: mockParentStatement,
				user: mockUser,
				statement: 'Child statement',
				paragraphs,
			});

			expect(result?.paragraphs).toEqual(paragraphs);
		});

		it('should handle parent with no parents array', () => {
			const parentNoParents = {
				...mockParentStatement,
				parents: undefined,
			} as unknown as Statement;

			const result = createBasicStatement({
				parentStatement: parentNoParents,
				user: mockUser,
				statement: 'Child statement',
			});

			expect(result?.parents).toEqual([]);
		});
	});
});
