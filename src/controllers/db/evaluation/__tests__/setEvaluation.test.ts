/**
 * Tests for setEvaluation controller
 */

/* eslint-disable @typescript-eslint/no-require-imports */

// Mock @freedi/shared-types before import to prevent valibot loading
jest.mock('@freedi/shared-types', () => ({
	Collections: {
		evaluations: 'evaluations',
		statements: 'statements',
	},
	EvaluationUI: {
		suggestions: 'suggestions',
		voting: 'voting',
		checkbox: 'checkbox',
		clustering: 'clustering',
	},
	EvaluationSchema: {},
	StatementType: {
		statement: 'statement',
		option: 'option',
		question: 'question',
		document: 'document',
		group: 'group',
		comment: 'comment',
	},
	ResultsBy: {
		consensus: 'consensus',
		mostLiked: 'mostLiked',
		averageLikesDislikes: 'averageLikesDislikes',
		topOptions: 'topOptions',
	},
	CutoffBy: {
		topOptions: 'topOptions',
		aboveThreshold: 'aboveThreshold',
	},
}));

// Define types locally
interface User {
	uid: string;
	displayName: string;
}

enum StatementType {
	statement = 'statement',
	option = 'option',
	question = 'question',
	document = 'document',
	group = 'group',
	comment = 'comment',
}

enum ResultsBy {
	consensus = 'consensus',
	mostLiked = 'mostLiked',
	averageLikesDislikes = 'averageLikesDislikes',
	topOptions = 'topOptions',
}

enum CutoffBy {
	topOptions = 'topOptions',
	aboveThreshold = 'aboveThreshold',
}

interface Statement {
	statementId: string;
	parentId: string;
	topParentId: string;
	statement: string;
	statementType: StatementType;
	creator: User;
	creatorId: string;
	createdAt: number;
	lastUpdate: number;
	consensus: number;
	parents: string[];
	results: unknown[];
	resultsSettings: {
		resultsBy: ResultsBy;
		numberOfResults: number;
		cutoffBy: CutoffBy;
	};
}

enum EvaluationUI {
	suggestions = 'suggestions',
	voting = 'voting',
	checkbox = 'checkbox',
	clustering = 'clustering',
}

const Collections = {
	evaluations: 'evaluations',
	statements: 'statements',
};

import {
	setEvaluationToDB,
	setEvaluationUIType,
	setAnchoredEvaluationSettings,
	setMaxVotesPerUser,
} from '../setEvaluation';

// Mock Firebase Firestore
const mockSetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDoc = jest.fn();

jest.mock('firebase/firestore', () => ({
	Timestamp: {
		now: () => ({ toMillis: () => Date.now() }),
	},
	doc: (...args: unknown[]) => mockDoc(...args),
	setDoc: (...args: unknown[]) => mockSetDoc(...args),
	updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
}));

// Mock Firebase config
jest.mock('../../config', () => ({
	FireStore: {},
}));

// Mock Valibot
jest.mock('valibot', () => ({
	number: jest.fn(() => 'number-schema'),
	parse: jest.fn((schema, value) => {
		if (schema === 'number-schema' && typeof value !== 'number') {
			throw new Error('Invalid number');
		}
		
return value;
	}),
}));

// Mock analytics service
jest.mock('@/services/analytics', () => ({
	analyticsService: {
		trackStatementVote: jest.fn(),
	},
}));

// Mock logger service
jest.mock('@/services/logger', () => ({
	logger: {
		info: jest.fn(),
		error: jest.fn(),
	},
}));

describe('setEvaluation', () => {
	const mockStatement: Statement = {
		statementId: 'stmt-123',
		parentId: 'parent-123',
		topParentId: 'top-123',
		statement: 'Test statement',
		statementType: StatementType.option,
		creator: { uid: 'user-456', displayName: 'Test User' } as User,
		creatorId: 'user-456',
		createdAt: Date.now(),
		lastUpdate: Date.now(),
		consensus: 0,
		parents: ['parent-123'],
		results: [],
		resultsSettings: {
			resultsBy: ResultsBy.consensus,
			numberOfResults: 1,
			cutoffBy: CutoffBy.topOptions,
		},
	};

	const mockUser: User = {
		uid: 'user-789',
		displayName: 'Evaluator',
		email: 'test@example.com',
	} as User;

	beforeEach(() => {
		jest.clearAllMocks();
		mockDoc.mockReturnValue('mock-ref');
		mockSetDoc.mockResolvedValue(undefined);
		mockUpdateDoc.mockResolvedValue(undefined);
	});

	describe('setEvaluationToDB', () => {
		it('should save evaluation successfully', async () => {
			await setEvaluationToDB(mockStatement, mockUser, 0.5);

			expect(mockDoc).toHaveBeenCalledWith(
				expect.anything(),
				Collections.evaluations,
				`${mockUser.uid}--${mockStatement.statementId}`
			);
			expect(mockSetDoc).toHaveBeenCalled();
		});

		it('should create correct evaluation ID', async () => {
			await setEvaluationToDB(mockStatement, mockUser, 0.5);

			const expectedId = `${mockUser.uid}--${mockStatement.statementId}`;
			expect(mockDoc).toHaveBeenCalledWith(
				expect.anything(),
				Collections.evaluations,
				expectedId
			);
		});

		it('should accept evaluation value of 1', async () => {
			await setEvaluationToDB(mockStatement, mockUser, 1);

			expect(mockSetDoc).toHaveBeenCalled();
		});

		it('should accept evaluation value of -1', async () => {
			await setEvaluationToDB(mockStatement, mockUser, -1);

			expect(mockSetDoc).toHaveBeenCalled();
		});

		it('should accept evaluation value of 0', async () => {
			await setEvaluationToDB(mockStatement, mockUser, 0);

			expect(mockSetDoc).toHaveBeenCalled();
		});

		it('should throw error for evaluation > 1', async () => {
			const { logger } = require('@/services/logger');

			await setEvaluationToDB(mockStatement, mockUser, 1.5);

			expect(logger.error).toHaveBeenCalledWith(
				'Failed to set evaluation',
				expect.any(Error),
				expect.objectContaining({
					statementId: mockStatement.statementId,
				})
			);
		});

		it('should throw error for evaluation < -1', async () => {
			const { logger } = require('@/services/logger');

			await setEvaluationToDB(mockStatement, mockUser, -1.5);

			expect(logger.error).toHaveBeenCalledWith(
				'Failed to set evaluation',
				expect.any(Error),
				expect.objectContaining({
					statementId: mockStatement.statementId,
				})
			);
		});

		it('should throw error when parentId is undefined', async () => {
			const statementWithoutParent = { ...mockStatement, parentId: undefined };
			const { logger } = require('@/services/logger');

			await setEvaluationToDB(statementWithoutParent as Statement, mockUser, 0.5);

			expect(logger.error).toHaveBeenCalled();
		});

		it('should track analytics event', async () => {
			const { analyticsService } = require('@/services/analytics');

			await setEvaluationToDB(mockStatement, mockUser, 0.5);

			expect(analyticsService.trackStatementVote).toHaveBeenCalledWith(
				mockStatement.statementId,
				0.5,
				'button'
			);
		});

		it('should log info on successful save', async () => {
			const { logger } = require('@/services/logger');

			await setEvaluationToDB(mockStatement, mockUser, 0.5);

			expect(logger.info).toHaveBeenCalledWith(
				'Evaluation set',
				expect.objectContaining({
					statementId: mockStatement.statementId,
					evaluation: 0.5,
					userId: mockUser.uid,
				})
			);
		});
	});

	describe('setEvaluationUIType', () => {
		it('should update evaluation UI type', () => {
			setEvaluationUIType('stmt-123', EvaluationUI.voting);

			expect(mockDoc).toHaveBeenCalledWith(
				expect.anything(),
				Collections.statements,
				'stmt-123'
			);
			expect(mockUpdateDoc).toHaveBeenCalledWith(
				expect.anything(),
				{ evaluationSettings: { evaluationUI: EvaluationUI.voting } }
			);
		});

		it('should return reference', () => {
			const result = setEvaluationUIType('stmt-123', EvaluationUI.suggestions);

			expect(result).toBe('mock-ref');
		});
	});

	describe('setAnchoredEvaluationSettings', () => {
		const anchoredSettings = {
			anchored: true,
			numberOfAnchoredStatements: 3,
			differentiateBetweenAnchoredAndNot: true,
			anchorIcon: '📌',
			anchorDescription: 'Test anchor',
			anchorLabel: 'Anchored',
		};

		it('should update anchored settings', async () => {
			await setAnchoredEvaluationSettings('stmt-123', anchoredSettings);

			expect(mockUpdateDoc).toHaveBeenCalledWith(
				expect.anything(),
				{ 'evaluationSettings.anchored': anchoredSettings }
			);
		});

		it('should log info on success', async () => {
			const { logger } = require('@/services/logger');

			await setAnchoredEvaluationSettings('stmt-123', anchoredSettings);

			expect(logger.info).toHaveBeenCalledWith(
				'Anchored Sampling Settings Changed',
				expect.objectContaining({
					statementId: 'stmt-123',
					enabled: true,
					numberOfAnchored: 3,
				})
			);
		});

		it('should throw and log error on failure', async () => {
			const error = new Error('Update failed');
			mockUpdateDoc.mockRejectedValueOnce(error);
			const { logger } = require('@/services/logger');

			await expect(
				setAnchoredEvaluationSettings('stmt-123', anchoredSettings)
			).rejects.toThrow('Update failed');

			expect(logger.error).toHaveBeenCalledWith(
				'Error updating anchored evaluation settings',
				error,
				expect.objectContaining({ statementId: 'stmt-123' })
			);
		});
	});

	describe('setMaxVotesPerUser', () => {
		it('should update max votes setting', async () => {
			await setMaxVotesPerUser('stmt-123', 5);

			expect(mockUpdateDoc).toHaveBeenCalledWith(
				expect.anything(),
				{ 'evaluationSettings.axVotesPerUser': 5 }
			);
		});

		it('should set to null when maxVotes is undefined', async () => {
			await setMaxVotesPerUser('stmt-123', undefined);

			expect(mockUpdateDoc).toHaveBeenCalledWith(
				expect.anything(),
				{ 'evaluationSettings.axVotesPerUser': null }
			);
		});

		it('should log info with max votes value', async () => {
			const { logger } = require('@/services/logger');

			await setMaxVotesPerUser('stmt-123', 10);

			expect(logger.info).toHaveBeenCalledWith(
				'Max Votes Per User Setting Changed',
				expect.objectContaining({
					statementId: 'stmt-123',
					maxVotes: 10,
				})
			);
		});

		it('should log unlimited when maxVotes is undefined', async () => {
			const { logger } = require('@/services/logger');

			await setMaxVotesPerUser('stmt-123', undefined);

			expect(logger.info).toHaveBeenCalledWith(
				'Max Votes Per User Setting Changed',
				expect.objectContaining({
					maxVotes: 'unlimited',
				})
			);
		});

		it('should throw and log error on failure', async () => {
			const error = new Error('Update failed');
			mockUpdateDoc.mockRejectedValueOnce(error);
			const { logger } = require('@/services/logger');

			await expect(setMaxVotesPerUser('stmt-123', 5)).rejects.toThrow('Update failed');

			expect(logger.error).toHaveBeenCalled();
		});
	});
});
