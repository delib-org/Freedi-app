/**
 * Tests for adminAccess - admin permission checking utilities
 */

import { AdminPermissionLevel } from '@freedi/shared-types';

// Mock dependencies
jest.mock('@freedi/shared-types', () => ({
	AdminPermissionLevel: {
		owner: 'owner',
		editor: 'editor',
		viewer: 'viewer',
	},
	Collections: {
		statements: 'statements',
		documentCollaborators: 'documentCollaborators',
		viewerLinks: 'viewerLinks',
	},
	hasPermissionLevel: jest.fn((userLevel: string, requiredLevel: string) => {
		const levels = ['viewer', 'editor', 'owner'];
		const userIndex = levels.indexOf(userLevel);
		const requiredIndex = levels.indexOf(requiredLevel);
		return userIndex >= requiredIndex;
	}),
}));

jest.mock('@/lib/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

jest.mock('node:crypto', () => ({
	randomBytes: jest.fn(() => ({
		toString: jest.fn(() => 'mock-secure-token-base64url'),
	})),
}));

import {
	checkAdminAccess,
	checkViewerLinkAccess,
	checkPermission,
	getDocumentCollaborators,
	getDocumentViewerLinks,
	generateSecureToken,
} from '../adminAccess';
import { hasPermissionLevel } from '@freedi/shared-types';
import { randomBytes } from 'node:crypto';

describe('adminAccess', () => {
	describe('checkPermission', () => {
		it('should return false for null user level', () => {
			expect(checkPermission(null, AdminPermissionLevel.viewer)).toBe(false);
		});

		it('should allow owner for any permission level', () => {
			expect(checkPermission(AdminPermissionLevel.owner, AdminPermissionLevel.viewer)).toBe(true);
			expect(checkPermission(AdminPermissionLevel.owner, AdminPermissionLevel.editor)).toBe(true);
			expect(checkPermission(AdminPermissionLevel.owner, AdminPermissionLevel.owner)).toBe(true);
		});

		it('should allow editor for viewer and editor levels', () => {
			expect(checkPermission(AdminPermissionLevel.editor, AdminPermissionLevel.viewer)).toBe(true);
			expect(checkPermission(AdminPermissionLevel.editor, AdminPermissionLevel.editor)).toBe(true);
		});

		it('should not allow editor for owner level', () => {
			expect(checkPermission(AdminPermissionLevel.editor, AdminPermissionLevel.owner)).toBe(false);
		});

		it('should only allow viewer for viewer level', () => {
			expect(checkPermission(AdminPermissionLevel.viewer, AdminPermissionLevel.viewer)).toBe(true);
			expect(checkPermission(AdminPermissionLevel.viewer, AdminPermissionLevel.editor)).toBe(false);
			expect(checkPermission(AdminPermissionLevel.viewer, AdminPermissionLevel.owner)).toBe(false);
		});

		it('should call hasPermissionLevel from shared-types', () => {
			checkPermission(AdminPermissionLevel.editor, AdminPermissionLevel.viewer);
			expect(hasPermissionLevel).toHaveBeenCalledWith(
				AdminPermissionLevel.editor,
				AdminPermissionLevel.viewer
			);
		});
	});

	describe('generateSecureToken', () => {
		it('should call randomBytes with 32 bytes', () => {
			generateSecureToken();
			expect(randomBytes).toHaveBeenCalledWith(32);
		});

		it('should return base64url encoded string', () => {
			const token = generateSecureToken();
			expect(token).toBe('mock-secure-token-base64url');
		});

		it('should generate non-empty token', () => {
			const token = generateSecureToken();
			expect(token.length).toBeGreaterThan(0);
		});
	});

	describe('checkAdminAccess', () => {
		const mockDb = {
			collection: jest.fn(() => mockDb),
			doc: jest.fn(() => mockDb),
			get: jest.fn(),
		};

		beforeEach(() => {
			jest.clearAllMocks();
			mockDb.collection.mockReturnValue(mockDb);
			mockDb.doc.mockReturnValue(mockDb);
		});

		it('should return not admin when document does not exist', async () => {
			mockDb.get.mockResolvedValueOnce({ exists: false });

			const result = await checkAdminAccess(
				mockDb as unknown as never,
				'doc-123',
				'user-456'
			);

			expect(result.isAdmin).toBe(false);
			expect(result.isOwner).toBe(false);
			expect(result.permissionLevel).toBeNull();
		});

		it('should return owner access when user is document creator', async () => {
			mockDb.get.mockResolvedValueOnce({
				exists: true,
				data: () => ({
					creator: { uid: 'user-456' },
					creatorId: 'user-456',
				}),
			});

			const result = await checkAdminAccess(
				mockDb as unknown as never,
				'doc-123',
				'user-456'
			);

			expect(result.isAdmin).toBe(true);
			expect(result.isOwner).toBe(true);
			expect(result.permissionLevel).toBe(AdminPermissionLevel.owner);
		});

		it('should check collaborators when not owner', async () => {
			mockDb.get
				.mockResolvedValueOnce({
					exists: true,
					data: () => ({
						creator: { uid: 'other-user' },
						creatorId: 'other-user',
					}),
				})
				.mockResolvedValueOnce({
					exists: true,
					data: () => ({
						permissionLevel: AdminPermissionLevel.editor,
					}),
				});

			const result = await checkAdminAccess(
				mockDb as unknown as never,
				'doc-123',
				'user-456'
			);

			expect(result.isAdmin).toBe(true);
			expect(result.isOwner).toBe(false);
			expect(result.permissionLevel).toBe(AdminPermissionLevel.editor);
		});

		it('should return not admin when user has no access', async () => {
			mockDb.get
				.mockResolvedValueOnce({
					exists: true,
					data: () => ({
						creator: { uid: 'other-user' },
						creatorId: 'other-user',
					}),
				})
				.mockResolvedValueOnce({ exists: false });

			const result = await checkAdminAccess(
				mockDb as unknown as never,
				'doc-123',
				'user-456'
			);

			expect(result.isAdmin).toBe(false);
			expect(result.isOwner).toBe(false);
			expect(result.permissionLevel).toBeNull();
		});

		it('should handle errors gracefully', async () => {
			mockDb.get.mockRejectedValueOnce(new Error('Database error'));

			const result = await checkAdminAccess(
				mockDb as unknown as never,
				'doc-123',
				'user-456'
			);

			expect(result.isAdmin).toBe(false);
			expect(result.permissionLevel).toBeNull();
		});
	});

	describe('checkViewerLinkAccess', () => {
		const mockDb = {
			collection: jest.fn(() => mockDb),
			where: jest.fn(() => mockDb),
			limit: jest.fn(() => mockDb),
			get: jest.fn(),
		};

		beforeEach(() => {
			jest.clearAllMocks();
			mockDb.collection.mockReturnValue(mockDb);
			mockDb.where.mockReturnValue(mockDb);
			mockDb.limit.mockReturnValue(mockDb);
		});

		it('should return invalid for non-existent token', async () => {
			mockDb.get.mockResolvedValueOnce({ empty: true });

			const result = await checkViewerLinkAccess(
				mockDb as unknown as never,
				'invalid-token'
			);

			expect(result.isValid).toBe(false);
			expect(result.viewerLink).toBeNull();
			expect(result.documentId).toBeNull();
		});

		it('should return invalid for expired token', async () => {
			mockDb.get.mockResolvedValueOnce({
				empty: false,
				docs: [
					{
						data: () => ({
							token: 'valid-token',
							documentId: 'doc-123',
							expiresAt: Date.now() - 1000, // Expired
							isActive: true,
						}),
					},
				],
			});

			const result = await checkViewerLinkAccess(
				mockDb as unknown as never,
				'valid-token'
			);

			expect(result.isValid).toBe(false);
		});

		it('should return valid for active non-expired token', async () => {
			const futureTime = Date.now() + 86400000; // 24 hours in future
			mockDb.get.mockResolvedValueOnce({
				empty: false,
				docs: [
					{
						data: () => ({
							token: 'valid-token',
							documentId: 'doc-123',
							expiresAt: futureTime,
							isActive: true,
						}),
					},
				],
			});

			const result = await checkViewerLinkAccess(
				mockDb as unknown as never,
				'valid-token'
			);

			expect(result.isValid).toBe(true);
			expect(result.documentId).toBe('doc-123');
		});

		it('should handle errors gracefully', async () => {
			mockDb.get.mockRejectedValueOnce(new Error('Query error'));

			const result = await checkViewerLinkAccess(
				mockDb as unknown as never,
				'any-token'
			);

			expect(result.isValid).toBe(false);
			expect(result.viewerLink).toBeNull();
		});
	});

	describe('getDocumentCollaborators', () => {
		const mockDb = {
			collection: jest.fn(() => mockDb),
			doc: jest.fn(() => mockDb),
			get: jest.fn(),
		};

		beforeEach(() => {
			jest.clearAllMocks();
			mockDb.collection.mockReturnValue(mockDb);
			mockDb.doc.mockReturnValue(mockDb);
		});

		it('should return array of collaborators', async () => {
			mockDb.get.mockResolvedValueOnce({
				docs: [
					{ data: () => ({ userId: 'user-1', permissionLevel: 'editor' }) },
					{ data: () => ({ userId: 'user-2', permissionLevel: 'viewer' }) },
				],
			});

			const result = await getDocumentCollaborators(
				mockDb as unknown as never,
				'doc-123'
			);

			expect(result).toHaveLength(2);
			expect(result[0].userId).toBe('user-1');
			expect(result[1].userId).toBe('user-2');
		});

		it('should return empty array when no collaborators', async () => {
			mockDb.get.mockResolvedValueOnce({ docs: [] });

			const result = await getDocumentCollaborators(
				mockDb as unknown as never,
				'doc-123'
			);

			expect(result).toEqual([]);
		});

		it('should handle errors gracefully', async () => {
			mockDb.get.mockRejectedValueOnce(new Error('Query error'));

			const result = await getDocumentCollaborators(
				mockDb as unknown as never,
				'doc-123'
			);

			expect(result).toEqual([]);
		});
	});

	describe('getDocumentViewerLinks', () => {
		const mockDb = {
			collection: jest.fn(() => mockDb),
			where: jest.fn(() => mockDb),
			get: jest.fn(),
		};

		beforeEach(() => {
			jest.clearAllMocks();
			mockDb.collection.mockReturnValue(mockDb);
			mockDb.where.mockReturnValue(mockDb);
		});

		it('should return active non-expired links', async () => {
			const futureTime = Date.now() + 86400000;
			mockDb.get.mockResolvedValueOnce({
				docs: [
					{
						data: () => ({
							token: 'link-1',
							expiresAt: futureTime,
							isActive: true,
						}),
					},
				],
			});

			const result = await getDocumentViewerLinks(
				mockDb as unknown as never,
				'doc-123'
			);

			expect(result).toHaveLength(1);
			expect(result[0].token).toBe('link-1');
		});

		it('should filter out expired links', async () => {
			const pastTime = Date.now() - 1000;
			const futureTime = Date.now() + 86400000;
			mockDb.get.mockResolvedValueOnce({
				docs: [
					{
						data: () => ({
							token: 'expired-link',
							expiresAt: pastTime,
							isActive: true,
						}),
					},
					{
						data: () => ({
							token: 'valid-link',
							expiresAt: futureTime,
							isActive: true,
						}),
					},
				],
			});

			const result = await getDocumentViewerLinks(
				mockDb as unknown as never,
				'doc-123'
			);

			expect(result).toHaveLength(1);
			expect(result[0].token).toBe('valid-link');
		});

		it('should return empty array when no links', async () => {
			mockDb.get.mockResolvedValueOnce({ docs: [] });

			const result = await getDocumentViewerLinks(
				mockDb as unknown as never,
				'doc-123'
			);

			expect(result).toEqual([]);
		});

		it('should handle errors gracefully', async () => {
			mockDb.get.mockRejectedValueOnce(new Error('Query error'));

			const result = await getDocumentViewerLinks(
				mockDb as unknown as never,
				'doc-123'
			);

			expect(result).toEqual([]);
		});
	});
});
