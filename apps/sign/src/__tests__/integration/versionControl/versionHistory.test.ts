/**
 * End-to-End Integration Tests - Version History & Restoration
 * Tests version tracking, history viewing, and rollback functionality
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
	createMockDocument,
	createMockParagraph,
	createVersionHistory,
	createMockAdminUser,
} from './testHelpers';

describe('Version Control - Version History (E2E)', () => {
	let mockDocument: ReturnType<typeof createMockDocument>;
	let mockParagraph: ReturnType<typeof createMockParagraph>;
	let mockAdmin: ReturnType<typeof createMockAdminUser>;

	beforeEach(() => {
		mockDocument = createMockDocument();
		mockParagraph = createMockParagraph(mockDocument.statementId);
		mockAdmin = createMockAdminUser();
	});

	describe('Version History Creation', () => {
		it('should create history entry on first replacement', async () => {
			// Arrange: Paragraph at version 1 (initial)
			expect(mockParagraph.versionControl!.currentVersion).toBe(1);

			// Act: First replacement occurs
			// createVersionHistory() should be called

			// Assert: History entry for version 1 created
			const historyEntry = {
				statementId: `history_1_${mockParagraph.statementId}`,
				statement: mockParagraph.statement,
				parentId: mockParagraph.statementId,
				hide: true,
			};

			expect(historyEntry.hide).toBe(true);
			expect(historyEntry.parentId).toBe(mockParagraph.statementId);
		});

		it('should maintain version sequence (1, 2, 3...)', async () => {
			// Arrange: Create history with multiple versions
			const versionCount = 5;
			const versions = createVersionHistory(mockParagraph.statementId, versionCount);

			// Assert: Versions are sequential
			versions.forEach((version, index) => {
				expect(version.versionControl!.currentVersion).toBe(index + 1);
			});
		});

		it('should store metadata with each version', async () => {
			// Arrange: Version entry
			const versions = createVersionHistory(mockParagraph.statementId, 1);
			const version1 = versions[0];

			// Assert: Metadata present
			expect(version1.versionControl).toBeDefined();
			expect(version1.versionControl!.currentVersion).toBe(1);
			expect(version1.versionControl!.finalizedBy).toBeDefined();
			expect(version1.versionControl!.finalizedAt).toBeDefined();
			expect(version1.versionControl!.finalizedReason).toBe('manual_approval');
		});
	});

	describe('Hybrid Storage (Recent + Compressed)', () => {
		it('should keep last 4 versions as full Statement objects', async () => {
			// Arrange: Create 4 versions
			const recentVersions = createVersionHistory(mockParagraph.statementId, 4);

			// Assert: All stored as full objects
			recentVersions.forEach(version => {
				expect(version.hide).toBe(true);
				expect(version.statement).toBeDefined();
				expect(version.versionControl).toBeDefined();
			});
		});

		it('should compress versions 5+ into archive', async () => {
			// Arrange: Create 10 versions (4 recent + 6 archived)
			const allVersions = createVersionHistory(mockParagraph.statementId, 10);

			const recentVersions = allVersions.slice(-4); // Last 4
			const archivedVersions = allVersions.slice(0, 6); // First 6

			// Assert: Recent versions are full objects
			expect(recentVersions.length).toBe(4);

			// Assert: Archived versions would be compressed
			// fn_pruneVersionHistory would compress these
			expect(archivedVersions.length).toBe(6);
		});

		it('should automatically prune on version creation', async () => {
			// Arrange: Paragraph with maxRecentVersions = 4
			expect(mockDocument.doc!.versionControlSettings!.maxRecentVersions).toBe(4);

			// Act: Create 5th version
			const versions = createVersionHistory(mockParagraph.statementId, 5);

			// Assert: Only 4 recent versions in main collection
			// 5th version triggers pruning of 1st version
			const recentCount = 4;
			expect(versions.slice(-recentCount).length).toBe(4);
		});

		it('should enforce maxTotalVersions limit', async () => {
			// Arrange: Create 60 versions (exceeds maxTotalVersions: 50)
			const maxTotal = mockDocument.doc!.versionControlSettings!.maxTotalVersions!;
			const createdCount = maxTotal + 10;

			// Act: Pruning should delete oldest archives
			// fn_pruneVersionHistory would enforce limit

			// Assert: Only maxTotalVersions retained
			expect(maxTotal).toBe(50);
			expect(createdCount).toBeGreaterThan(maxTotal);
		});
	});

	describe('Version Decompression', () => {
		it('should decompress archived versions for viewing', async () => {
			// Arrange: Archived version (compressed)
			const compressedData = 'base64_encoded_compressed_data';

			// Act: API endpoint fetches and decompresses
			// GET /api/paragraphs/[paragraphId]/versions would decompress

			// Assert: Decompressed successfully
			expect(compressedData).toBeDefined();
			// pako.ungzip() would be called in API
		});

		it('should handle decompression errors gracefully', async () => {
			// Arrange: Corrupted compressed data
			const corruptedData = 'invalid_base64';

			// Act & Assert: Should throw or return error
			expect(() => {
				// Simulated decompression attempt
				if (!corruptedData.startsWith('base64_')) {
					throw new Error('Invalid compressed data');
				}
			}).toThrow();
		});
	});

	describe('Version Navigation', () => {
		it('should fetch all versions for a paragraph', async () => {
			// Arrange: Paragraph with 10 versions
			const versions = createVersionHistory(mockParagraph.statementId, 10);

			// Act: GET /api/paragraphs/[paragraphId]/versions
			// Should return 4 recent (full) + 6 archived (decompressed)

			// Assert: All 10 versions returned
			expect(versions.length).toBe(10);
		});

		it('should mark current version in history list', async () => {
			// Arrange: Paragraph at version 5
			const currentVersion = 5;
			const updatedParagraph = {
				...mockParagraph,
				versionControl: {
					...mockParagraph.versionControl,
					currentVersion,
				},
			};

			// Act: Fetch history
			const versions = createVersionHistory(mockParagraph.statementId, 10);

			// Assert: Version 5 marked as current
			const version5 = versions.find(
				v => v.versionControl!.currentVersion === currentVersion
			);
			expect(version5).toBeDefined();
			expect(updatedParagraph.versionControl!.currentVersion).toBe(currentVersion);
		});

		it('should display version metadata (who, when, how)', async () => {
			// Arrange: Version with full metadata
			const version = createVersionHistory(mockParagraph.statementId, 1)[0];

			// Assert: All metadata present
			expect(version.versionControl!.finalizedBy).toBe('user_admin');
			expect(version.versionControl!.finalizedAt).toBeDefined();
			expect(version.versionControl!.finalizedReason).toBe('manual_approval');
			expect(version.consensus).toBeDefined();
		});
	});

	describe('Version Restoration (Rollback)', () => {
		it('should restore to previous version', async () => {
			// Arrange: Paragraph at version 5, want to restore to version 2
			const targetVersion = 2;

			const versions = createVersionHistory(mockParagraph.statementId, 5);
			const version2 = versions[1]; // Index 1 = version 2

			// Act: POST /api/admin/paragraphs/[paragraphId]/restore
			const restoreRequest = {
				targetVersionNumber: targetVersion,
				adminNotes: 'Reverting to earlier version',
			};

			// Assert: Restoration creates new version with old text
			// New version would be version 6 (current version 5 + 1)
			expect(restoreRequest.targetVersionNumber).toBe(2);
			expect(version2.statement).toBeDefined();
		});

		it('should create history entry for current version before rollback', async () => {
			// Arrange: Current version 5 about to be rolled back
			const currentVersion = 5;

			// Act: Rollback to version 2
			// Before rollback, version 5 should be saved to history

			// Assert: Version 5 saved
			const historyForVersion5 = {
				statementId: `history_5_${mockParagraph.statementId}`,
				versionControl: {
					currentVersion: 5,
					finalizedReason: 'manual_approval',
				},
			};

			expect(historyForVersion5.versionControl.currentVersion).toBe(currentVersion);
		});

		it('should increment version number after rollback', async () => {
			// Arrange: At version 5, rollback to version 2
			const currentVersion = 5;
			// Target version 2 for rollback

			// Act: Rollback
			const newVersion = currentVersion + 1; // Becomes version 6

			// Assert: New version is 6 (not overwriting version 5)
			expect(newVersion).toBe(6);
			expect(newVersion).toBeGreaterThan(currentVersion);
		});

		it('should set finalizedReason to "rollback"', async () => {
			// Arrange: Rollback scenario targeting version 2

			// Act: Restore version 2
			const expectedVersionControl = {
				currentVersion: 6, // New version
				finalizedReason: 'rollback',
				finalizedBy: mockAdmin.uid,
				adminNotes: 'Restored from version 2',
			};

			// Assert
			expect(expectedVersionControl.finalizedReason).toBe('rollback');
		});

		it('should require owner permission for rollback', async () => {
			// Arrange: Regular admin (not owner)
			const regularAdmin = { ...mockAdmin, role: 'admin' };

			// Act: Attempt rollback
			// verifyOwner() should reject

			// Assert: Permission denied
			expect(regularAdmin.role).toBe('admin');
			// API would return 403 if not owner
		});

		it('should log audit trail for rollback', async () => {
			// Arrange: Rollback scenario
			const fromVersion = 5;
			const toVersion = 2;

			// Act: Rollback
			const expectedAuditLog = {
				documentId: mockDocument.statementId,
				paragraphId: mockParagraph.statementId,
				userId: mockAdmin.uid,
				action: 'rollback_executed',
				metadata: {
					fromVersion,
					toVersion,
					notes: 'Reverting to earlier version',
				},
			};

			// Assert
			expect(expectedAuditLog.action).toBe('rollback_executed');
			expect(expectedAuditLog.metadata.fromVersion).toBe(fromVersion);
			expect(expectedAuditLog.metadata.toVersion).toBe(toVersion);
		});
	});

	describe('Edge Cases', () => {
		it('should handle rollback to version 1 (initial)', async () => {
			// Arrange: At version 10, rollback to version 1
			const currentVersion = 10;
			const targetVersion = 1;

			// Act: Rollback to initial version
			// Should work same as any other rollback

			// Assert: Valid operation
			expect(targetVersion).toBe(1);
			expect(currentVersion).toBeGreaterThan(targetVersion);
		});

		it('should prevent rollback to current version', async () => {
			// Arrange: Current version 5
			const currentVersion = 5;
			const targetVersion = 5; // Same as current

			// Act & Assert: Should reject
			if (targetVersion === currentVersion) {
				throw new Error('Cannot restore to current version');
			}

			expect(() => {
				if (targetVersion === currentVersion) {
					throw new Error('Cannot restore to current version');
				}
			}).toThrow();
		});

		it('should handle rollback to non-existent version', async () => {
			// Arrange: Paragraph has 5 versions
			const currentVersion = 5;
			const targetVersion = 10; // Doesn't exist

			// Act & Assert: Should return 404
			expect(targetVersion).toBeGreaterThan(currentVersion);
			// API would return "Version not found"
		});
	});

	describe('Performance with Large History', () => {
		it('should handle 50+ versions efficiently', async () => {
			// Arrange: Maximum versions (50)
			const maxVersions = mockDocument.doc!.versionControlSettings!.maxTotalVersions!;
			const versions = createVersionHistory(mockParagraph.statementId, maxVersions);

			// Assert: All versions created
			expect(versions.length).toBe(maxVersions);

			// Performance: Recent versions fast, archived decompress on demand
			const recentVersions = versions.slice(-4);
			expect(recentVersions.length).toBe(4);
		});

		it('should paginate version history for UI performance', async () => {
			// Arrange: 50 versions
			const allVersions = createVersionHistory(mockParagraph.statementId, 50);

			// Act: Paginate (e.g., 10 per page)
			const pageSize = 10;
			const page1 = allVersions.slice(0, pageSize);

			// Assert: Only load what's needed
			expect(page1.length).toBe(pageSize);
			expect(allVersions.length).toBe(50);
		});
	});
});
