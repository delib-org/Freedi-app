import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections, Statement, AuditAction } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { verifyOwner, logAudit } from '@/lib/utils/versionControlHelpers';
import { createVersionHistory } from '@/controllers/versionControl/createVersionHistory';

/**
 * Request body for version restore
 */
interface RestoreVersionRequest {
	targetVersionNumber: number;
	adminNotes?: string;
}

/**
 * POST /api/paragraphs/[paragraphId]/restore
 * Restore paragraph to a previous version
 *
 * This creates a new version with the text from the target version (rollback).
 * Only document owners can perform rollback (destructive action).
 *
 * Body:
 * - targetVersionNumber: number (version to restore to)
 * - adminNotes?: string (optional reason for rollback)
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ paragraphId: string }> }
): Promise<NextResponse> {
	try {
		const { paragraphId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));
		const body: RestoreVersionRequest = await request.json();

		const { targetVersionNumber, adminNotes } = body;

		// Validate input
		if (!targetVersionNumber || targetVersionNumber < 1) {
			return NextResponse.json(
				{ error: 'targetVersionNumber must be a positive number' },
				{ status: 400 }
			);
		}

		const db = getFirestoreAdmin();

		// Get current paragraph
		const paragraphRef = db.collection(Collections.statements).doc(paragraphId);
		const paragraphSnap = await paragraphRef.get();

		if (!paragraphSnap.exists) {
			return NextResponse.json({ error: 'Paragraph not found' }, { status: 404 });
		}

		const paragraph = paragraphSnap.data() as Statement;
		const currentVersion = paragraph.versionControl?.currentVersion || 1;

		// Verify owner access (only owners can rollback)
		await verifyOwner(db, paragraph.topParentId, userId);

		// Can't restore to current version
		if (targetVersionNumber === currentVersion) {
			return NextResponse.json(
				{ error: 'Cannot restore to current version' },
				{ status: 400 }
			);
		}

		// Can't restore to future version
		if (targetVersionNumber > currentVersion) {
			return NextResponse.json(
				{ error: 'Cannot restore to future version' },
				{ status: 400 }
			);
		}

		// Find target version
		let targetVersionText: string | null = null;

		// Check recent versions (Tier 1)
		const recentVersionsSnap = await db
			.collection(Collections.statements)
			.where('parentId', '==', paragraphId)
			.where('hide', '==', true)
			.where('versionControl.currentVersion', '==', targetVersionNumber)
			.limit(1)
			.get();

		if (!recentVersionsSnap.empty) {
			const versionData = recentVersionsSnap.docs[0].data() as Statement;
			targetVersionText = versionData.statement;
		} else {
			// Check archived versions (Tier 2)
			const archiveSnap = await paragraphRef.collection('versionArchive').get();

			for (const archiveDoc of archiveSnap.docs) {
				const archive = archiveDoc.data();

				if (
					targetVersionNumber >= archive.startVersion &&
					targetVersionNumber <= archive.endVersion
				) {
					// Decompress and find target version
					const pako = await import('pako');
					const compressedBuffer = Buffer.from(archive.compressedData, 'base64');
					const decompressed = pako.ungzip(compressedBuffer, { to: 'string' });
					const versions = JSON.parse(decompressed);

					const targetVersion = versions.find(
						(v: { versionNumber: number }) => v.versionNumber === targetVersionNumber
					);

					if (targetVersion) {
						targetVersionText = targetVersion.text;
						break;
					}
				}
			}
		}

		if (!targetVersionText) {
			return NextResponse.json(
				{ error: `Version ${targetVersionNumber} not found` },
				{ status: 404 }
			);
		}

		// Use transaction for atomicity
		const newVersion = await db.runTransaction(async (transaction) => {
			// Create version history for current state
			await createVersionHistory({
				db,
				transaction,
				paragraphId,
				versionNumber: currentVersion,
				text: paragraph.statement,
				replacedBy: `rollback_to_v${targetVersionNumber}`,
				consensus: paragraph.consensus || 0,
				finalizedBy: userId!,
				adminNotes: adminNotes || `Rolled back to version ${targetVersionNumber}`,
			});

			// Update paragraph with target version text
			const newVersionNumber = currentVersion + 1;

			transaction.update(paragraphRef, {
				statement: targetVersionText,
				lastUpdate: Date.now(),
				'versionControl.currentVersion': newVersionNumber,
				'versionControl.appliedSuggestionId': undefined,
				'versionControl.appliedAt': Date.now(),
				'versionControl.finalizedBy': userId,
				'versionControl.finalizedAt': Date.now(),
				'versionControl.finalizedReason': 'rollback',
				'versionControl.adminNotes': adminNotes || `Rolled back to version ${targetVersionNumber}`,
			});

			return newVersionNumber;
		});

		// Log audit trail
		await logAudit(db, {
			documentId: paragraph.topParentId,
			paragraphId,
			userId: userId!,
			action: AuditAction.rollback_executed,
			metadata: {
				fromVersion: currentVersion,
				toVersion: targetVersionNumber,
				notes: adminNotes,
			},
		});

		logger.info('[Version Restore API] Version restored', {
			paragraphId,
			fromVersion: currentVersion,
			toVersion: targetVersionNumber,
			newVersion,
		});

		return NextResponse.json({
			success: true,
			restoredToVersion: targetVersionNumber,
			newVersion,
		});
	} catch (error) {
		logger.error('[Version Restore API] POST error:', error);

		if (error instanceof Error) {
			if (error.message.includes('not authenticated')) {
				return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
			}
			if (error.message.includes('Only document owner')) {
				return NextResponse.json(
					{ error: 'Forbidden - Only document owner can perform rollback' },
					{ status: 403 }
				);
			}
		}

		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
