import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Statement, VersionArchive } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import * as pako from 'pako';

/**
 * Version entry interface for response
 */
interface VersionEntry {
	versionNumber: number;
	text: string;
	replacedAt: number;
	replacedBy?: string;
	consensus?: number;
	finalizedBy?: string;
	adminEdited?: boolean;
	adminNotes?: string;
	isCurrent: boolean;
}

/**
 * GET /api/paragraphs/[paragraphId]/versions
 * Get version history for a paragraph
 *
 * Returns both recent versions (Tier 1) and decompressed archived versions (Tier 2)
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ paragraphId: string }> }
): Promise<NextResponse> {
	try {
		const { paragraphId } = await params;
		const db = getFirestoreAdmin();

		// Get current paragraph
		const paragraphRef = db.collection(Collections.statements).doc(paragraphId);
		const paragraphSnap = await paragraphRef.get();

		if (!paragraphSnap.exists) {
			return NextResponse.json({ error: 'Paragraph not found' }, { status: 404 });
		}

		const paragraph = paragraphSnap.data() as Statement;
		const currentVersion = paragraph.versionControl?.currentVersion || 1;

		// Get recent versions (Tier 1 - full storage)
		const recentVersionsSnap = await db
			.collection(Collections.statements)
			.where('parentId', '==', paragraphId)
			.where('hide', '==', true)
			.orderBy('versionControl.currentVersion', 'desc')
			.get();

		const recentVersions: VersionEntry[] = recentVersionsSnap.docs.map((doc) => {
			const data = doc.data() as Statement;
			return {
				versionNumber: data.versionControl?.currentVersion || 0,
				text: data.statement,
				replacedAt: data.versionControl?.appliedAt || data.lastUpdate,
				replacedBy: data.versionControl?.appliedSuggestionId,
				consensus: data.consensus,
				finalizedBy: data.versionControl?.finalizedBy,
				adminEdited: !!data.versionControl?.adminEditedContent,
				adminNotes: data.versionControl?.adminNotes,
				isCurrent: false,
			};
		});

		// Get archived versions (Tier 2 - compressed storage)
		const archiveSnap = await paragraphRef.collection('versionArchive').get();

		const archivedVersions: VersionEntry[] = [];

		for (const archiveDoc of archiveSnap.docs) {
			const archive = archiveDoc.data() as VersionArchive;

			try {
				// Decompress
				const compressedBuffer = Buffer.from(archive.compressedData, 'base64');
				const decompressed = pako.ungzip(compressedBuffer, { to: 'string' });
				const versions = JSON.parse(decompressed) as Array<{
					versionNumber: number;
					text: string;
					replacedAt: number;
					consensus: number;
					finalizedBy: string;
					adminEdited?: boolean;
					adminNotes?: string;
					replacedBy?: string;
				}>;

				archivedVersions.push(
					...versions.map((v) => ({
						...v,
						isCurrent: false,
					}))
				);
			} catch (decompressError) {
				logger.error('[Version History API] Failed to decompress archive', {
					paragraphId,
					archiveId: archive.archiveId,
					error: decompressError,
				});
				// Continue with other archives
			}
		}

		// Add current version
		const currentVersionEntry: VersionEntry = {
			versionNumber: currentVersion,
			text: paragraph.statement,
			replacedAt: paragraph.versionControl?.appliedAt || paragraph.lastUpdate,
			replacedBy: paragraph.versionControl?.appliedSuggestionId,
			consensus: paragraph.consensus,
			finalizedBy: paragraph.versionControl?.finalizedBy,
			adminEdited: !!paragraph.versionControl?.adminEditedContent,
			adminNotes: paragraph.versionControl?.adminNotes,
			isCurrent: true,
		};

		// Combine and sort all versions
		const allVersions = [currentVersionEntry, ...recentVersions, ...archivedVersions].sort(
			(a, b) => b.versionNumber - a.versionNumber
		);

		logger.info('[Version History API] Versions fetched', {
			paragraphId,
			totalVersions: allVersions.length,
			currentVersion,
		});

		return NextResponse.json({
			success: true,
			versions: allVersions,
			totalVersions: allVersions.length,
			currentVersion,
		});
	} catch (error) {
		logger.error('[Version History API] GET error:', error);

		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
