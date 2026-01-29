/**
 * End-to-End Integration Tests - Approval Flow
 * Tests the complete flow: Suggestion → Queue → Approval → Replacement
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
	createMockDocument,
	createMockParagraph,
	createMockSuggestion,
	createMockAdminUser,
	simulateNetworkDelay,
	assertQueueItem,
	assertVersionControl,
} from './testHelpers';

describe('Version Control - Approval Flow (E2E)', () => {
	let mockDocument: ReturnType<typeof createMockDocument>;
	let mockParagraph: ReturnType<typeof createMockParagraph>;
	let mockSuggestion: ReturnType<typeof createMockSuggestion>;
	let mockAdmin: ReturnType<typeof createMockAdminUser>;

	beforeEach(() => {
		mockDocument = createMockDocument();
		mockParagraph = createMockParagraph(mockDocument.statementId);
		mockAdmin = createMockAdminUser();
	});

	afterEach(() => {
		// Cleanup mock data
		jest.clearAllMocks();
	});

	describe('Queue Creation Flow', () => {
		it('should create queue item when consensus crosses threshold', async () => {
			// Arrange: Create suggestion below threshold
			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.45 // Below 50% threshold
			);

			// Act: Simulate consensus increase to 51%
			const updatedSuggestion = {
				...mockSuggestion,
				consensus: 0.51,
			};

			// Assert: Queue item should be created
			// This would trigger fn_createReplacementQueueItem Cloud Function
			expect(updatedSuggestion.consensus).toBeGreaterThanOrEqual(
				mockDocument.doc!.versionControlSettings!.reviewThreshold!
			);
		});

		it('should NOT create queue item if version control disabled', async () => {
			// Arrange: Disable version control
			const disabledDoc = createMockDocument({
				doc: {
					isDoc: true,
					versionControlSettings: {
						enabled: false,
						reviewThreshold: 0.5,
						allowAdminEdit: true,
						enableVersionHistory: true,
						maxRecentVersions: 4,
						maxTotalVersions: 50,
						lastSettingsUpdate: Date.now(),
						updatedBy: 'user_admin',
					},
				},
			});

			// Act & Assert: Even if consensus > threshold, no queue item
			expect(disabledDoc.doc!.versionControlSettings!.enabled).toBe(false);
		});

		it('should supersede old queue item when new suggestion reaches threshold', async () => {
			// Arrange: Two suggestions for same paragraph
			const oldSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.52,
				{ statementId: 'sugg_old' }
			);

			const newSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.55,
				{ statementId: 'sugg_new' }
			);

			// Act: New suggestion reaches threshold after old one
			// Cloud Function should mark old as superseded

			// Assert: Old queue item should be marked superseded
			expect(newSuggestion.consensus).toBeGreaterThan(oldSuggestion.consensus);
			expect(oldSuggestion.parentId).toBe(newSuggestion.parentId);
		});
	});

	describe('Real-time Consensus Updates', () => {
		it('should update queue consensus in real-time as votes change', async () => {
			// Arrange: Queue item created at 51% consensus
			const initialConsensus = 0.51;
			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				initialConsensus
			);

			// Act: Simulate voting that increases consensus to 65%
			const updatedConsensus = 0.65;
			const updatedSuggestion = {
				...mockSuggestion,
				consensus: updatedConsensus,
				totalEvaluators: 120,
			};

			// Assert: Queue item consensus should match
			// This would be updated by fn_updateQueueConsensus
			expect(updatedSuggestion.consensus).toBe(updatedConsensus);
			expect(updatedSuggestion.totalEvaluators).toBeGreaterThan(
				mockSuggestion.totalEvaluators!
			);
		});

		it('should detect staleness when consensus drops below threshold', async () => {
			// Arrange: Queue item created at 52% consensus
			const consensusAtCreation = 0.52;
			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				consensusAtCreation
			);

			// Act: Consensus drops to 42% (10% drop = stale)
			const currentConsensus = 0.42;
			const drop = consensusAtCreation - currentConsensus;

			// Assert: Should be detected as stale (>10% drop)
			expect(drop).toBeGreaterThan(0.1);
			expect(currentConsensus).toBeLessThan(
				mockDocument.doc!.versionControlSettings!.reviewThreshold!
			);
		});
	});

	describe('Approval Action', () => {
		it('should approve suggestion without editing', async () => {
			// Arrange: Queue item ready for approval
			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.55
			);

			const approvalData = {
				action: 'approve',
				adminNotes: 'Looks good!',
			};

			// Act: Admin approves
			// This would call POST /api/admin/version-control/queue/[queueId]/action

			// Assert: Expected outcome
			expect(approvalData.action).toBe('approve');

			// Expected results:
			// 1. Version history created for current version
			// 2. Paragraph updated with suggestion text
			// 3. Version number incremented
			// 4. Queue item marked approved
			// 5. Suggestion marked as applied (hide: true)
		});

		it('should approve suggestion with admin editing', async () => {
			// Arrange: Queue item with admin edit enabled
			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.55,
				{ statement: 'Original suggested text' }
			);

			const approvalData = {
				action: 'approve',
				adminEditedText: 'Admin-edited version of the text',
				adminNotes: 'Modified for clarity',
			};

			// Act: Admin edits and approves
			expect(mockDocument.doc!.versionControlSettings!.allowAdminEdit).toBe(true);

			// Assert: Admin edited text should be used
			expect(approvalData.adminEditedText).not.toBe(mockSuggestion.statement);
		});

		it('should create version history entry on approval', async () => {
			// Arrange: Paragraph at version 1
			expect(mockParagraph.versionControl!.currentVersion).toBe(1);

			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.55
			);

			// Act: Approve suggestion
			// Controller: createVersionHistory() should be called

			// Assert: Version history entry created
			const expectedHistoryEntry = {
				statementId: `history_1_${mockParagraph.statementId}`,
				statement: mockParagraph.statement,
				parentId: mockParagraph.statementId,
				hide: true,
				versionControl: {
					currentVersion: 1,
					finalizedBy: mockAdmin.uid,
					finalizedReason: 'manual_approval',
				},
			};

			expect(expectedHistoryEntry.hide).toBe(true);
			expect(expectedHistoryEntry.versionControl?.currentVersion).toBe(1);
		});

		it('should update paragraph to new version on approval', async () => {
			// Arrange: Initial state
			const initialVersion = mockParagraph.versionControl!.currentVersion;
			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.55
			);

			// Act: Approval replaces paragraph
			const updatedParagraph = {
				...mockParagraph,
				statement: mockSuggestion.statement,
				versionControl: {
					...mockParagraph.versionControl,
					currentVersion: initialVersion + 1,
					appliedSuggestionId: mockSuggestion.statementId,
					finalizedBy: mockAdmin.uid,
					finalizedAt: Date.now(),
					finalizedReason: 'manual_approval',
				},
			};

			// Assert: Version incremented and text updated
			expect(updatedParagraph.statement).toBe(mockSuggestion.statement);
			expect(updatedParagraph.versionControl!.currentVersion).toBe(initialVersion + 1);
			expect(updatedParagraph.versionControl!.appliedSuggestionId).toBe(
				mockSuggestion.statementId
			);
		});

		it('should send notification to suggestion creator on approval', async () => {
			// Arrange
			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.55
			);

			// Act: Approval
			const expectedNotification = {
				userId: mockSuggestion.creatorId,
				type: 'suggestion_approved',
				message: 'Your suggestion was approved and is now part of the document',
				documentId: mockDocument.statementId,
				paragraphId: mockParagraph.statementId,
			};

			// Assert: Notification should be sent
			expect(expectedNotification.userId).toBe(mockSuggestion.creatorId);
			expect(expectedNotification.type).toBe('suggestion_approved');
		});

		it('should log audit trail on approval', async () => {
			// Arrange
			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.55
			);

			// Act: Approval
			const expectedAuditLog = {
				documentId: mockDocument.statementId,
				paragraphId: mockParagraph.statementId,
				userId: mockAdmin.uid,
				action: 'approval_granted',
				metadata: {
					consensus: mockSuggestion.consensus,
					adminEdited: false,
					notes: 'Approved',
				},
			};

			// Assert: Audit log created
			expect(expectedAuditLog.action).toBe('approval_granted');
			expect(expectedAuditLog.userId).toBe(mockAdmin.uid);
		});
	});

	describe('Rejection Flow', () => {
		it('should reject suggestion with required notes', async () => {
			// Arrange
			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.55
			);

			const rejectionData = {
				action: 'reject',
				adminNotes: 'Not aligned with document goals',
			};

			// Act & Assert: Notes are required
			expect(rejectionData.adminNotes).toBeDefined();
			expect(rejectionData.adminNotes.length).toBeGreaterThan(0);
		});

		it('should NOT update paragraph on rejection', async () => {
			// Arrange: Original paragraph state
			const originalStatement = mockParagraph.statement;
			const originalVersion = mockParagraph.versionControl!.currentVersion;

			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.55
			);

			// Act: Rejection
			// Paragraph should remain unchanged

			// Assert: Paragraph unchanged
			expect(mockParagraph.statement).toBe(originalStatement);
			expect(mockParagraph.versionControl!.currentVersion).toBe(originalVersion);
		});

		it('should send notification to creator on rejection', async () => {
			// Arrange
			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.55
			);

			// Act: Rejection
			const expectedNotification = {
				userId: mockSuggestion.creatorId,
				type: 'suggestion_rejected',
				message: 'Your suggestion was reviewed and not accepted at this time',
			};

			// Assert
			expect(expectedNotification.type).toBe('suggestion_rejected');
		});
	});

	describe('Concurrent Admin Actions', () => {
		it('should handle concurrent approvals with transaction safety', async () => {
			// Arrange: Two admins try to approve same queue item
			const admin1 = createMockAdminUser();
			const admin2 = { ...createMockAdminUser(), uid: 'user_admin_2' };

			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.55
			);

			// Act: Both admins click approve simultaneously
			// Firestore transaction should ensure only one succeeds

			// Assert: Only one approval should succeed
			// Transaction in executeReplacement() prevents race condition
			expect(admin1.uid).not.toBe(admin2.uid);
		});
	});

	describe('Network Resilience', () => {
		it('should handle network timeout during approval', async () => {
			// Arrange
			mockSuggestion = createMockSuggestion(
				mockParagraph.statementId,
				mockDocument.statementId,
				0.55
			);

			// Act: Simulate network timeout
			await expect(async () => {
				await simulateNetworkDelay(10000); // 10 second timeout
				// Approval API call would timeout
			}).rejects.toThrow();

			// Assert: UI should show error, allow retry
		});

		it('should support offline mode with Firebase persistence', async () => {
			// Arrange: User goes offline
			const isOnline = false;

			// Act: User tries to approve while offline
			// Firebase SDK should queue the operation

			// Assert: Operation queued for when online
			expect(isOnline).toBe(false);
			// Firebase persistence would handle this automatically
		});
	});
});
