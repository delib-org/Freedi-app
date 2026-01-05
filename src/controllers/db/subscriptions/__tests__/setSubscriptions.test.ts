/**
 * Tests for setSubscriptions controller
 */

// Mock @freedi/shared-types before import to prevent valibot loading
jest.mock('@freedi/shared-types', () => ({
	StatementType: {
		statement: 'statement',
		option: 'option',
		question: 'question',
		document: 'document',
		group: 'group',
		comment: 'comment',
	},
	Role: {
		admin: 'admin',
		member: 'member',
		waiting: 'waiting',
		banned: 'banned',
	},
	Collections: {
		statementsSubscriptions: 'statementsSubscriptions',
	},
	SubscriptionSchema: {},
}));

// Define types locally since we're mocking the module
enum StatementType {
	statement = 'statement',
	option = 'option',
	question = 'question',
	document = 'document',
	group = 'group',
	comment = 'comment',
}

enum Role {
	admin = 'admin',
	member = 'member',
	waiting = 'waiting',
	banned = 'banned',
}

interface Creator {
	uid: string;
	displayName: string;
	email: string;
}

interface Statement {
	statementId: string;
	parentId: string;
	topParentId: string;
	statement: string;
	statementType: StatementType;
	creator: Creator;
	creatorId: string;
	createdAt: number;
	lastUpdate: number;
	consensus: number;
	parents: string[];
	results: unknown[];
	resultsSettings: {
		resultsBy: string;
		numberOfResults: number;
		cutoffBy: string;
	};
}

import {
	setStatementSubscriptionToDB,
	updateLastReadTimestamp,
	updateMemberRole,
	addTokenToSubscription,
	removeTokenFromSubscription,
	updateNotificationPreferences,
} from '../setSubscriptions';

// Mock Firebase
jest.mock('firebase/firestore', () => ({
	doc: jest.fn(),
	updateDoc: jest.fn(),
	setDoc: jest.fn(),
	getDoc: jest.fn(),
	arrayUnion: jest.fn((val) => ({ _arrayUnion: val })),
	arrayRemove: jest.fn((val) => ({ _arrayRemove: val })),
	Timestamp: {
		now: jest.fn(() => ({
			toMillis: jest.fn(() => 1704067200000),
		})),
	},
}));

jest.mock('../../config', () => ({
	FireStore: {},
}));

// Mock valibot
jest.mock('valibot', () => ({
	parse: jest.fn((schema, value) => value),
}));

// Mock helpers
jest.mock('@/controllers/general/helpers', () => ({
	getStatementSubscriptionId: jest.fn((statementId, userId) => `${userId}--${statementId}`),
}));

// Mock redux
jest.mock('@/redux/store', () => ({
	store: {
		dispatch: jest.fn(),
	},
}));

jest.mock('@/redux/userDemographic/userDemographicSlice', () => ({
	setShowGroupDemographicModal: jest.fn(),
}));

// Mock demographic functions
jest.mock('../../userDemographic/getUserDemographic', () => ({
	getGroupDemographicQuestions: jest.fn().mockResolvedValue([]),
	getUserGroupAnswers: jest.fn().mockResolvedValue([]),
}));

import { doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';

const mockDoc = doc as jest.MockedFunction<typeof doc>;
const mockUpdateDoc = updateDoc as jest.MockedFunction<typeof updateDoc>;
const mockSetDoc = setDoc as jest.MockedFunction<typeof setDoc>;
const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;

describe('setSubscriptions', () => {
	const mockCreator: Creator = {
		uid: 'user-123',
		displayName: 'Test User',
		email: 'test@example.com',
	};

	const mockStatement: Statement = {
		statementId: 'stmt-123',
		parentId: 'parent-123',
		topParentId: 'top-123',
		statement: 'Test statement',
		statementType: StatementType.option,
		creator: mockCreator,
		creatorId: mockCreator.uid,
		createdAt: Date.now(),
		lastUpdate: Date.now(),
		consensus: 0,
		parents: ['top-123', 'parent-123'],
		results: [],
		resultsSettings: {
			resultsBy: 'consensus',
			numberOfResults: 1,
			cutoffBy: 'topOptions',
		},
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockDoc.mockReturnValue({} as ReturnType<typeof doc>);
		mockUpdateDoc.mockResolvedValue(undefined);
		mockSetDoc.mockResolvedValue(undefined);
		jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('setStatementSubscriptionToDB', () => {
		it('should create subscription when user is not subscribed', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			// Use a different user than the statement creator to test member role
			const differentCreator: Creator = {
				uid: 'different-user-789',
				displayName: 'Different User',
				email: 'different@example.com',
			};

			await setStatementSubscriptionToDB({
				statement: mockStatement,
				creator: differentCreator,
			});

			expect(mockSetDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					userId: 'different-user-789',
					statementId: 'stmt-123',
					role: Role.member,
				}),
				{ merge: true }
			);
		});

		it('should not create subscription when user is already subscribed', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => true,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await setStatementSubscriptionToDB({
				statement: mockStatement,
				creator: mockCreator,
			});

			expect(mockSetDoc).not.toHaveBeenCalled();
		});

		it('should set admin role when creator is statement owner', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await setStatementSubscriptionToDB({
				statement: mockStatement,
				creator: mockCreator, // Same as statement.creator
			});

			expect(mockSetDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					role: Role.admin,
				}),
				{ merge: true }
			);
		});

		it('should use custom role when provided', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			const differentCreator: Creator = {
				uid: 'different-user-456',
				displayName: 'Different User',
				email: 'different@example.com',
			};

			await setStatementSubscriptionToDB({
				statement: mockStatement,
				creator: differentCreator,
				role: Role.waiting,
			});

			expect(mockSetDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					role: Role.waiting,
				}),
				{ merge: true }
			);
		});

		it('should handle notification preferences', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await setStatementSubscriptionToDB({
				statement: mockStatement,
				creator: { ...mockCreator, uid: 'other-user' },
				getInAppNotification: true,
				getEmailNotification: true,
				getPushNotification: true,
			});

			expect(mockSetDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					getInAppNotification: true,
					getEmailNotification: true,
					getPushNotification: true,
				}),
				{ merge: true }
			);
		});

		it('should return early if statement is missing', async () => {
			await setStatementSubscriptionToDB({
				statement: undefined as unknown as Statement,
				creator: mockCreator,
			});

			expect(mockSetDoc).not.toHaveBeenCalled();
		});

		it('should return early if creator is missing', async () => {
			await setStatementSubscriptionToDB({
				statement: mockStatement,
				creator: undefined as unknown as Creator,
			});

			expect(mockSetDoc).not.toHaveBeenCalled();
		});

		it('should return early if creator.uid is missing', async () => {
			await setStatementSubscriptionToDB({
				statement: mockStatement,
				creator: { ...mockCreator, uid: '' } as Creator,
			});

			expect(mockSetDoc).not.toHaveBeenCalled();
		});
	});

	describe('updateLastReadTimestamp', () => {
		it('should update timestamp when subscription exists', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => true,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await updateLastReadTimestamp('stmt-123', 'user-123');

			expect(mockUpdateDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					lastReadTimestamp: expect.any(Number),
					statementId: 'stmt-123',
				})
			);
		});

		it('should not update when subscription does not exist', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await updateLastReadTimestamp('stmt-123', 'user-123');

			expect(mockUpdateDoc).not.toHaveBeenCalled();
		});

		it('should throw error when statementId is missing', async () => {
			await updateLastReadTimestamp('', 'user-123');

			// Should throw and log error
			expect(mockUpdateDoc).not.toHaveBeenCalled();
		});

		it('should throw error when userId is missing', async () => {
			await updateLastReadTimestamp('stmt-123', '');

			expect(mockUpdateDoc).not.toHaveBeenCalled();
		});
	});

	describe('updateMemberRole', () => {
		it('should update member role', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => true,
				data: () => ({ role: Role.member }),
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await updateMemberRole('stmt-123', 'user-123', Role.admin);

			expect(mockUpdateDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					role: Role.admin,
					statementId: 'stmt-123',
				})
			);
		});

		it('should throw error for invalid subscription id', async () => {
			(getStatementSubscriptionId as jest.Mock).mockReturnValueOnce(null);

			await expect(
				updateMemberRole('stmt-123', 'user-123', Role.admin)
			).rejects.toThrow('Error in getting statementSubscriptionId');
		});
	});

	describe('addTokenToSubscription', () => {
		it('should add token when subscription exists', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => true,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await addTokenToSubscription('stmt-123', 'user-123', 'fcm-token-abc');

			expect(mockUpdateDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					tokens: { _arrayUnion: 'fcm-token-abc' },
					statementId: 'stmt-123',
				})
			);
		});

		it('should not add token when subscription does not exist', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await addTokenToSubscription('stmt-123', 'user-123', 'fcm-token-abc');

			expect(mockUpdateDoc).not.toHaveBeenCalled();
		});
	});

	describe('removeTokenFromSubscription', () => {
		it('should remove token when subscription exists', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => true,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await removeTokenFromSubscription('stmt-123', 'user-123', 'fcm-token-abc');

			expect(mockUpdateDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					tokens: { _arrayRemove: 'fcm-token-abc' },
					statementId: 'stmt-123',
				})
			);
		});

		it('should not remove token when subscription does not exist', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await removeTokenFromSubscription('stmt-123', 'user-123', 'fcm-token-abc');

			expect(mockUpdateDoc).not.toHaveBeenCalled();
		});
	});

	describe('updateNotificationPreferences', () => {
		it('should update preferences when subscription exists', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => true,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await updateNotificationPreferences('stmt-123', 'user-123', {
				getInAppNotification: true,
				getEmailNotification: false,
				getPushNotification: true,
			});

			expect(mockUpdateDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					getInAppNotification: true,
					getEmailNotification: false,
					getPushNotification: true,
					statementId: 'stmt-123',
				})
			);
		});

		it('should not update preferences when subscription does not exist', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => false,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await updateNotificationPreferences('stmt-123', 'user-123', {
				getInAppNotification: true,
			});

			expect(mockUpdateDoc).not.toHaveBeenCalled();
		});

		it('should handle partial preferences update', async () => {
			mockGetDoc.mockResolvedValue({
				exists: () => true,
			} as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never);

			await updateNotificationPreferences('stmt-123', 'user-123', {
				getPushNotification: false,
			});

			expect(mockUpdateDoc).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					getPushNotification: false,
				})
			);
		});
	});
});
