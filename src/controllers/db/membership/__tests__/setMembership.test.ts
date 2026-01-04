/**
 * Tests for setMembership controller
 */

import { WaitingMember, Role, Collections } from 'delib-npm';
import { approveMembership } from '../setMembership';

// Mock Firebase Firestore
const mockUpdateDoc = jest.fn();
const mockDoc = jest.fn();
const mockWriteBatch = jest.fn();
const mockBatchDelete = jest.fn();
const mockBatchCommit = jest.fn();

jest.mock('firebase/firestore', () => ({
	doc: (...args: unknown[]) => mockDoc(...args),
	updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
	writeBatch: (...args: unknown[]) => mockWriteBatch(...args),
}));

// Mock Firebase DB config
jest.mock('../../config', () => ({
	DB: {},
}));

// Mock Valibot
jest.mock('valibot', () => ({
	parse: jest.fn((schema, value) => value),
}));

describe('setMembership', () => {
	const mockWaitingMember: WaitingMember = {
		odema: 'test-odema',
		odemaId: 'odema-123',
		odemaTitle: 'Test Odema',
		statementId: 'stmt-123',
		statementsSubscribeId: 'sub-123',
		role: Role.waitingMember,
		displayName: 'Test User',
		photoURL: 'https://example.com/photo.jpg',
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockDoc.mockReturnValue('mock-doc-ref');
		mockUpdateDoc.mockResolvedValue(undefined);
		mockWriteBatch.mockReturnValue({
			delete: mockBatchDelete,
			commit: mockBatchCommit.mockResolvedValue(undefined),
		});
	});

	describe('approveMembership', () => {
		it('should approve membership when accept is true', async () => {
			await approveMembership(mockWaitingMember, true);

			expect(mockDoc).toHaveBeenCalledWith(
				expect.anything(),
				Collections.statementsSubscribe,
				mockWaitingMember.statementsSubscribeId
			);
			expect(mockUpdateDoc).toHaveBeenCalledWith('mock-doc-ref', { role: Role.member });
		});

		it('should ban member when accept is false', async () => {
			await approveMembership(mockWaitingMember, false);

			expect(mockUpdateDoc).toHaveBeenCalledWith('mock-doc-ref', { role: Role.banned });
		});

		it('should delete from waiting list after approval', async () => {
			await approveMembership(mockWaitingMember, true);

			expect(mockDoc).toHaveBeenCalledWith(
				expect.anything(),
				Collections.awaitingUsers,
				mockWaitingMember.statementsSubscribeId
			);
			expect(mockBatchDelete).toHaveBeenCalled();
			expect(mockBatchCommit).toHaveBeenCalled();
		});

		it('should delete from waiting list after rejection', async () => {
			await approveMembership(mockWaitingMember, false);

			expect(mockBatchDelete).toHaveBeenCalled();
			expect(mockBatchCommit).toHaveBeenCalled();
		});

		it('should throw error when updateDoc fails', async () => {
			const error = new Error('Update failed');
			mockUpdateDoc.mockRejectedValueOnce(error);
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			await expect(approveMembership(mockWaitingMember, true)).rejects.toThrow('Update failed');

			expect(consoleErrorSpy).toHaveBeenCalledWith('Error in approveMembership:', error);
			consoleErrorSpy.mockRestore();
		});

		it('should throw error when batch commit fails', async () => {
			const error = new Error('Batch commit failed');
			mockBatchCommit.mockRejectedValueOnce(error);
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			await expect(approveMembership(mockWaitingMember, true)).rejects.toThrow('Batch commit failed');

			expect(consoleErrorSpy).toHaveBeenCalled();
			consoleErrorSpy.mockRestore();
		});

		it('should validate waiting member schema', async () => {
			const { parse } = require('valibot');

			await approveMembership(mockWaitingMember, true);

			expect(parse).toHaveBeenCalled();
		});

		it('should use statementsSubscribeId as document key', async () => {
			await approveMembership(mockWaitingMember, true);

			// Should use statementsSubscribeId for both subscription and waiting list
			expect(mockDoc).toHaveBeenCalledWith(
				expect.anything(),
				Collections.statementsSubscribe,
				'sub-123'
			);
			expect(mockDoc).toHaveBeenCalledWith(
				expect.anything(),
				Collections.awaitingUsers,
				'sub-123'
			);
		});
	});

	describe('edge cases', () => {
		it('should handle waitingMember with minimal data', async () => {
			const minimalMember: WaitingMember = {
				odema: '',
				odemaId: '',
				odemaTitle: '',
				statementId: '',
				statementsSubscribeId: 'sub-minimal',
				role: Role.waitingMember,
			};

			await approveMembership(minimalMember, true);

			expect(mockUpdateDoc).toHaveBeenCalled();
		});
	});
});
