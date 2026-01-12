/**
 * Tests for queries - Firestore query utilities for Sign app
 */

import { StatementType } from '@freedi/shared-types';
import { ParagraphType } from '@/types';

// Mock dependencies
jest.mock('../admin', () => ({
	getFirestoreAdmin: jest.fn(),
}));

jest.mock('@/lib/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

jest.mock('@/lib/utils/paragraphUtils', () => ({
	descriptionToParagraphs: jest.fn((desc, id) =>
		desc
			? [
					{
						paragraphId: id ? `${id}-description` : 'p_mock',
						type: 'paragraph',
						content: desc,
						order: 0,
					},
			  ]
			: []
	),
	sortParagraphs: jest.fn((paragraphs) =>
		[...paragraphs].sort((a, b) => a.order - b.order)
	),
}));

jest.mock('@/constants/common', () => ({
	QUERY_LIMITS: {
		PARAGRAPHS: 100,
		COMMENTS: 50,
	},
	UI: {
		TOP_PARAGRAPHS_LIMIT: 10,
	},
}));

import { getFirestoreAdmin } from '../admin';
import {
	getDocumentForSigning,
	getParagraphsFromStatement,
	getParagraphsByParent,
	getUserSignature,
	getDocumentSignatures,
	getUserApprovals,
	getComments,
	getCommentCountsForDocument,
} from '../queries';
import { logError } from '@/lib/utils/errorHandling';

describe('queries', () => {
	// Mock Firestore database
	const mockDoc = jest.fn();
	const mockCollection = jest.fn();
	const mockWhere = jest.fn();
	const mockOrderBy = jest.fn();
	const mockLimit = jest.fn();
	const mockGet = jest.fn();

	const mockDb = {
		collection: mockCollection,
		doc: mockDoc,
	};

	beforeEach(() => {
		jest.clearAllMocks();

		// Setup chainable mock
		mockCollection.mockReturnValue({
			doc: mockDoc,
			where: mockWhere,
		});
		mockDoc.mockReturnValue({
			get: mockGet,
			collection: mockCollection,
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

	describe('getDocumentForSigning', () => {
		it('should return null for non-existent document', async () => {
			mockGet.mockResolvedValueOnce({ exists: false });

			const result = await getDocumentForSigning('non-existent-id');

			expect(result).toBeNull();
		});

		it('should return document for question type', async () => {
			const mockStatement = {
				statementId: 'doc-123',
				statement: 'Test question',
				statementType: StatementType.question,
				paragraphs: [],
			};
			mockGet.mockResolvedValueOnce({
				exists: true,
				data: () => mockStatement,
			});

			const result = await getDocumentForSigning('doc-123');

			expect(result).toEqual(mockStatement);
		});

		it('should return document for option type', async () => {
			const mockStatement = {
				statementId: 'doc-123',
				statementType: StatementType.option,
			};
			mockGet.mockResolvedValueOnce({
				exists: true,
				data: () => mockStatement,
			});

			const result = await getDocumentForSigning('doc-123');

			expect(result?.statementType).toBe(StatementType.option);
		});

		it('should return document for document type', async () => {
			const mockStatement = {
				statementId: 'doc-123',
				statementType: StatementType.document,
			};
			mockGet.mockResolvedValueOnce({
				exists: true,
				data: () => mockStatement,
			});

			const result = await getDocumentForSigning('doc-123');

			expect(result?.statementType).toBe(StatementType.document);
		});

		it('should return null for statement type (not signable)', async () => {
			const mockStatement = {
				statementId: 'doc-123',
				statementType: StatementType.statement,
			};
			mockGet.mockResolvedValueOnce({
				exists: true,
				data: () => mockStatement,
			});

			const result = await getDocumentForSigning('doc-123');

			expect(result).toBeNull();
		});

		it('should throw and log error on database error', async () => {
			const error = new Error('Database error');
			mockGet.mockRejectedValueOnce(error);

			await expect(getDocumentForSigning('doc-123')).rejects.toThrow(
				'Database error'
			);
			expect(logError).toHaveBeenCalled();
		});
	});

	describe('getParagraphsFromStatement', () => {
		it('should return sorted paragraphs when paragraphs array exists', () => {
			const statement = {
				statementId: 'stmt-1',
				paragraphs: [
					{ paragraphId: 'p1', order: 2, content: 'Second', type: ParagraphType.paragraph },
					{ paragraphId: 'p2', order: 1, content: 'First', type: ParagraphType.paragraph },
				],
			};

			const result = getParagraphsFromStatement(statement as never);

			expect(result[0].order).toBe(1);
			expect(result[1].order).toBe(2);
		});

		it('should convert description to paragraphs when no paragraphs array', () => {
			const statement = {
				statementId: 'stmt-1',
				paragraphs: [],
				description: 'This is a description',
			};

			const result = getParagraphsFromStatement(statement as never);

			expect(result).toHaveLength(1);
			expect(result[0].content).toBe('This is a description');
		});

		it('should return empty array when no paragraphs and no description', () => {
			const statement = {
				statementId: 'stmt-1',
				paragraphs: [],
			};

			const result = getParagraphsFromStatement(statement as never);

			expect(result).toEqual([]);
		});
	});

	describe('getParagraphsByParent', () => {
		it('should return paragraphs for parent', async () => {
			const mockParagraphs = [
				{ statementId: 'p1', statement: 'Para 1', hide: false },
				{ statementId: 'p2', statement: 'Para 2', hide: false },
			];
			mockGet.mockResolvedValueOnce({
				docs: mockParagraphs.map((p) => ({ data: () => p })),
			});

			const result = await getParagraphsByParent('parent-123');

			expect(result).toHaveLength(2);
		});

		it('should filter out hidden paragraphs', async () => {
			const mockParagraphs = [
				{ statementId: 'p1', statement: 'Visible', hide: false },
				{ statementId: 'p2', statement: 'Hidden', hide: true },
			];
			mockGet.mockResolvedValueOnce({
				docs: mockParagraphs.map((p) => ({ data: () => p })),
			});

			const result = await getParagraphsByParent('parent-123');

			expect(result).toHaveLength(1);
			expect(result[0].statement).toBe('Visible');
		});

		it('should return empty array when no paragraphs', async () => {
			mockGet.mockResolvedValueOnce({ docs: [] });

			const result = await getParagraphsByParent('parent-123');

			expect(result).toEqual([]);
		});
	});

	describe('getUserSignature', () => {
		it('should return signature when exists', async () => {
			const mockSignature = {
				signatureId: 'user-123--doc-456',
				signed: 'signed',
				date: Date.now(),
			};
			mockGet.mockResolvedValueOnce({
				exists: true,
				data: () => mockSignature,
			});

			const result = await getUserSignature('doc-456', 'user-123');

			expect(result).toEqual(mockSignature);
		});

		it('should return null when signature does not exist', async () => {
			mockGet.mockResolvedValueOnce({ exists: false });

			const result = await getUserSignature('doc-456', 'user-123');

			expect(result).toBeNull();
		});

		it('should use correct signature ID format', async () => {
			mockGet.mockResolvedValueOnce({ exists: false });

			await getUserSignature('doc-456', 'user-123');

			// Verify the doc was called with correct ID
			expect(mockDoc).toHaveBeenCalledWith('user-123--doc-456');
		});
	});

	describe('getDocumentSignatures', () => {
		it('should return all signatures for document', async () => {
			const mockSignatures = [
				{ signatureId: 'sig1', signed: 'signed' },
				{ signatureId: 'sig2', signed: 'rejected' },
			];
			mockGet.mockResolvedValueOnce({
				docs: mockSignatures.map((s) => ({ data: () => s })),
			});

			const result = await getDocumentSignatures('doc-123');

			expect(result).toHaveLength(2);
		});

		it('should return empty array when no signatures', async () => {
			mockGet.mockResolvedValueOnce({ docs: [] });

			const result = await getDocumentSignatures('doc-123');

			expect(result).toEqual([]);
		});
	});

	describe('getUserApprovals', () => {
		it('should return user approvals for document', async () => {
			const mockApprovals = [
				{ approvalId: 'a1', approval: true },
				{ approvalId: 'a2', approval: false },
			];
			mockGet.mockResolvedValueOnce({
				docs: mockApprovals.map((a) => ({ data: () => a })),
			});

			const result = await getUserApprovals('doc-123', 'user-456');

			expect(result).toHaveLength(2);
		});

		it('should return empty array when no approvals', async () => {
			mockGet.mockResolvedValueOnce({ docs: [] });

			const result = await getUserApprovals('doc-123', 'user-456');

			expect(result).toEqual([]);
		});
	});

	describe('getComments', () => {
		it('should return comments for paragraph', async () => {
			const mockComments = [
				{ statementId: 'c1', statement: 'Comment 1', hide: false },
				{ statementId: 'c2', statement: 'Comment 2', hide: false },
			];
			mockGet.mockResolvedValueOnce({
				docs: mockComments.map((c) => ({ data: () => c })),
			});

			const result = await getComments('para-123');

			expect(result).toHaveLength(2);
		});

		it('should filter out hidden comments', async () => {
			const mockComments = [
				{ statementId: 'c1', statement: 'Visible', hide: false },
				{ statementId: 'c2', statement: 'Hidden', hide: true },
			];
			mockGet.mockResolvedValueOnce({
				docs: mockComments.map((c) => ({ data: () => c })),
			});

			const result = await getComments('para-123');

			expect(result).toHaveLength(1);
		});
	});

	describe('getCommentCountsForDocument', () => {
		it('should return counts for all paragraphs', async () => {
			const mockComments = [
				{ parentId: 'p1', statementType: StatementType.statement, hide: false },
				{ parentId: 'p1', statementType: StatementType.statement, hide: false },
				{ parentId: 'p2', statementType: StatementType.statement, hide: false },
			];
			mockGet.mockResolvedValueOnce({
				docs: mockComments.map((c) => ({ data: () => c })),
			});

			const result = await getCommentCountsForDocument('doc-123', ['p1', 'p2', 'p3']);

			expect(result['p1']).toBe(2);
			expect(result['p2']).toBe(1);
			expect(result['p3']).toBe(0);
		});

		it('should return empty counts for empty paragraph list', async () => {
			const result = await getCommentCountsForDocument('doc-123', []);

			expect(result).toEqual({});
		});

		it('should not count hidden comments', async () => {
			const mockComments = [
				{ parentId: 'p1', statementType: StatementType.statement, hide: false },
				{ parentId: 'p1', statementType: StatementType.statement, hide: true },
			];
			mockGet.mockResolvedValueOnce({
				docs: mockComments.map((c) => ({ data: () => c })),
			});

			const result = await getCommentCountsForDocument('doc-123', ['p1']);

			expect(result['p1']).toBe(1);
		});
	});
});
