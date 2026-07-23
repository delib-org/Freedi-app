/**
 * Tests for homeQueries - Home page document queries
 * Verifies correct document hierarchy (Group -> Question -> Option) handling
 */

import { StatementType } from '@freedi/shared-types';

// Mock dependencies
jest.mock('../admin', () => ({
	getFirestoreAdmin: jest.fn(),
}));

jest.mock('@/lib/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

jest.mock('@/constants/common', () => ({
	QUERY_LIMITS: {
		HOME_DOCUMENTS: 100,
	},
	FIREBASE: {
		IN_QUERY_LIMIT: 30,
	},
}));

import { getFirestoreAdmin } from '../admin';
import { getUserHomeDocuments } from '../homeQueries';

describe('homeQueries', () => {
	// Mock Firestore chainable API
	let mockGet: jest.Mock;
	let mockLimit: jest.Mock;
	let mockOrderBy: jest.Mock;
	let mockWhere: jest.Mock;
	let mockCollection: jest.Mock;
	let mockDoc: jest.Mock;

	beforeEach(() => {
		// Create fresh mocks for each test to avoid queue pollution
		mockGet = jest.fn();
		mockLimit = jest.fn();
		mockOrderBy = jest.fn();
		mockWhere = jest.fn();
		mockCollection = jest.fn();
		mockDoc = jest.fn();

		const mockDb = {
			collection: mockCollection,
			doc: mockDoc,
		};

		mockCollection.mockReturnValue({
			doc: mockDoc,
			where: mockWhere,
		});
		mockDoc.mockReturnValue({
			get: mockGet,
		});
		mockWhere.mockReturnValue({
			where: mockWhere,
			orderBy: mockOrderBy,
			limit: mockLimit,
			get: mockGet,
		});
		mockOrderBy.mockReturnValue({
			limit: mockLimit,
			get: mockGet,
		});
		mockLimit.mockReturnValue({
			get: mockGet,
		});

		(getFirestoreAdmin as jest.Mock).mockReturnValue(mockDb);
	});

	describe('getUserHomeDocuments - document filtering', () => {
		/**
		 * Helper: set up mock responses for getUserHomeDocuments.
		 * The function runs parallel queries via Promise.all.
		 * .get() calls are consumed in order:
		 *
		 * 1. getCreatedDocuments
		 * 2. getCollaboratedDocuments
		 * 3. getSignedDocuments
		 * 4. getSubscribedDocuments
		 * 5. getUserGroups
		 * 6. batchGetSignatureCounts (only if there are documents in the result)
		 *
		 * (invitedDocs is skipped when no email is passed)
		 */
		function setupMockQueries({
			createdDocs = [] as Array<Record<string, unknown>>,
			groups = [] as Array<Record<string, unknown>>,
			hasDocuments = true,
		}) {
			// 1. getCreatedDocuments
			mockGet.mockResolvedValueOnce({
				docs: createdDocs.map((d) => ({ data: () => d })),
			});

			// 2. getCollaboratedDocuments (empty)
			mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

			// 3. getSignedDocuments (empty)
			mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

			// 4. getSubscribedDocuments (empty)
			mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

			// 5. getUserGroups
			mockGet.mockResolvedValueOnce({
				docs: groups.map((g) => ({ data: () => g })),
			});

			// 6. batchGetSignatureCounts — only called when there are documents
			if (hasDocuments) {
				mockGet.mockResolvedValueOnce({ docs: [] });
			}
		}

		it('should return options with isDocument: true', async () => {
			setupMockQueries({
				createdDocs: [
					{
						statementId: 'option-1',
						statement: 'My Document',
						statementType: StatementType.option,
						isDocument: true,
						creatorId: 'user-1',
						createdAt: Date.now(),
						lastUpdate: Date.now(),
						parentId: 'question-1',
						topParentId: 'group-1',
						creator: { displayName: 'Test User', uid: 'user-1' },
					},
				],
			});

			const result = await getUserHomeDocuments('user-1');

			expect(result.documents).toHaveLength(1);
			expect(result.documents[0].statementId).toBe('option-1');
		});

		it('should filter non-documents at query level (isDocument == true)', async () => {
			// Statements that aren't Sign documents (questions, plain options) are
			// excluded by the Firestore where clause, not by JS code.
			setupMockQueries({
				createdDocs: [],
				hasDocuments: false,
			});

			await getUserHomeDocuments('user-1');

			const isDocumentCall = mockWhere.mock.calls.find(
				(args: unknown[]) => args[0] === 'isDocument'
			);

			expect(isDocumentCall).toBeDefined();
			expect(isDocumentCall![1]).toBe('==');
			expect(isDocumentCall![2]).toBe(true);
		});

		it('should still return legacy StatementType.document', async () => {
			setupMockQueries({
				createdDocs: [
					{
						statementId: 'legacy-doc-1',
						statement: 'Legacy Document',
						statementType: StatementType.document,
						creatorId: 'user-1',
						createdAt: Date.now(),
						lastUpdate: Date.now(),
						parentId: 'group-1',
						topParentId: 'group-1',
						creator: { displayName: 'Test User', uid: 'user-1' },
					},
				],
			});

			const result = await getUserHomeDocuments('user-1');

			expect(result.documents).toHaveLength(1);
			expect(result.documents[0].statementId).toBe('legacy-doc-1');
		});

		it('should skip statements missing an id or a title', async () => {
			setupMockQueries({
				createdDocs: [
					{
						statementId: 'no-title',
						statementType: StatementType.option,
						isDocument: true,
						creatorId: 'user-1',
						createdAt: Date.now(),
						lastUpdate: Date.now(),
						parentId: 'question-1',
						topParentId: 'group-1',
						creator: { displayName: 'Test User', uid: 'user-1' },
					},
				],
				hasDocuments: false,
			});

			const result = await getUserHomeDocuments('user-1');

			expect(result.documents).toHaveLength(0);
		});

		it('should include topParentId in returned documents', async () => {
			setupMockQueries({
				createdDocs: [
					{
						statementId: 'option-1',
						statement: 'My Document',
						statementType: StatementType.option,
						isDocument: true,
						creatorId: 'user-1',
						createdAt: Date.now(),
						lastUpdate: Date.now(),
						parentId: 'question-1',
						topParentId: 'group-1',
						creator: { displayName: 'Test User', uid: 'user-1' },
					},
				],
			});

			const result = await getUserHomeDocuments('user-1');

			expect(result.documents[0].topParentId).toBe('group-1');
		});

		it('should strip HTML markup from the description preview', async () => {
			setupMockQueries({
				createdDocs: [
					{
						statementId: 'option-1',
						statement: 'My Document',
						statementType: StatementType.option,
						isDocument: true,
						description:
							'<strong>עקרונות היסוד</strong><p>&quot;החוקה&quot; תהיה חוק המדינה.</p>',
						creatorId: 'user-1',
						createdAt: Date.now(),
						lastUpdate: Date.now(),
						parentId: 'question-1',
						topParentId: 'group-1',
						creator: { displayName: 'Test User', uid: 'user-1' },
					},
				],
			});

			const result = await getUserHomeDocuments('user-1');

			expect(result.documents[0].description).toBe(
				'עקרונות היסוד "החוקה" תהיה חוק המדינה.'
			);
		});

		it('should leave the description undefined when there is none', async () => {
			setupMockQueries({
				createdDocs: [
					{
						statementId: 'option-1',
						statement: 'My Document',
						statementType: StatementType.option,
						isDocument: true,
						creatorId: 'user-1',
						createdAt: Date.now(),
						lastUpdate: Date.now(),
						parentId: 'question-1',
						topParentId: 'group-1',
						creator: { displayName: 'Test User', uid: 'user-1' },
					},
				],
			});

			const result = await getUserHomeDocuments('user-1');

			expect(result.documents[0].description).toBeUndefined();
		});
	});

	describe('getUserHomeDocuments - group name resolution', () => {
		function setupWithGroup(
			doc: Record<string, unknown>,
			group: Record<string, unknown>
		) {
			// 1. created docs
			mockGet.mockResolvedValueOnce({
				docs: [{ data: () => doc }],
			});
			// 2. collaborated (empty)
			mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
			// 3. signed (empty)
			mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
			// 4. subscribed (empty)
			mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
			// 5. groups
			mockGet.mockResolvedValueOnce({
				docs: [{ data: () => group }],
			});
			// 6. batchGetSignatureCounts
			mockGet.mockResolvedValueOnce({ docs: [] });
		}

		it('should resolve group name via parentId for legacy documents', async () => {
			const group = {
				statementId: 'group-1',
				statement: 'My Group',
				createdAt: Date.now(),
			};
			const doc = {
				statementId: 'legacy-doc',
				statement: 'Legacy Doc',
				statementType: StatementType.document,
				creatorId: 'user-1',
				createdAt: Date.now(),
				lastUpdate: Date.now(),
				parentId: 'group-1',
				topParentId: 'group-1',
				creator: { displayName: 'Test', uid: 'user-1' },
			};

			setupWithGroup(doc, group);

			const result = await getUserHomeDocuments('user-1');

			expect(result.documents[0].groupName).toBe('My Group');
		});

		it('should resolve group name via topParentId for new hierarchy documents', async () => {
			const group = {
				statementId: 'group-1',
				statement: 'My Group',
				createdAt: Date.now(),
			};
			const doc = {
				statementId: 'option-1',
				statement: 'New Doc',
				statementType: StatementType.option,
				isDocument: true,
				creatorId: 'user-1',
				createdAt: Date.now(),
				lastUpdate: Date.now(),
				parentId: 'question-1', // parentId is question, NOT group
				topParentId: 'group-1', // topParentId points to group
				creator: { displayName: 'Test', uid: 'user-1' },
			};

			setupWithGroup(doc, group);

			const result = await getUserHomeDocuments('user-1');

			// Should fall back to topParentId since parentId doesn't match a group
			expect(result.documents[0].groupName).toBe('My Group');
		});
	});
});
