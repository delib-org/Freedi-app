import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import { db } from './db';
import { Collections, Statement, VersionArchive } from '@freedi/shared-types';
import * as pako from 'pako';

/**
 * Interface for version data to be archived
 */
interface VersionData {
	versionNumber: number;
	text: string;
	replacedAt: number;
	consensus: number;
	finalizedBy: string;
	adminEdited?: boolean;
	adminNotes?: string;
	replacedBy?: string;
}

/**
 * Cloud Function: Prune Version History
 *
 * Triggers when a paragraph is updated.
 * Manages hybrid storage: keeps last 4 versions full, compresses older versions.
 *
 * MVP Features:
 * - Hybrid storage: Last 4 versions full, older compressed
 * - 70-80% size reduction with gzip compression
 * - Auto-pruning to prevent database bloat
 * - Respects maxRecentVersions and maxTotalVersions settings
 */
export const fn_pruneVersionHistory = onDocumentUpdated(
	`${Collections.statements}/{paragraphId}`,
	async (event) => {
		try {
			const before = event.data?.before.data() as Statement;
			const after = event.data?.after.data() as Statement;

			if (!before || !after) {
				return null;
			}

			// Only process official paragraphs (not suggestions)
			if (!after.doc?.isOfficialParagraph) {
				return null;
			}

			// Only if version changed
			if (
				!before.versionControl?.currentVersion ||
				!after.versionControl?.currentVersion ||
				before.versionControl.currentVersion === after.versionControl.currentVersion
			) {
				return null;
			}

			const paragraphId = event.params.paragraphId;

			logger.info('[fn_pruneVersionHistory] Version changed, checking if pruning needed', {
				paragraphId,
				oldVersion: before.versionControl.currentVersion,
				newVersion: after.versionControl.currentVersion,
			});

			// Get document to check settings
			const documentRef = db.collection(Collections.statements).doc(after.topParentId);
			const documentSnap = await documentRef.get();

			if (!documentSnap.exists) {
				logger.warn('[fn_pruneVersionHistory] Document not found', { paragraphId });
				
return null;
			}

			const document = documentSnap.data() as Statement;
			const maxRecentVersions = document.doc?.versionControlSettings?.maxRecentVersions || 4;
			const maxTotalVersions = document.doc?.versionControlSettings?.maxTotalVersions || 50;

			// Get recent versions (Tier 1 - full storage)
			const recentVersionsSnap = await db
				.collection(Collections.statements)
				.where('parentId', '==', paragraphId)
				.where('hide', '==', true)
				.orderBy('versionControl.currentVersion', 'desc')
				.get();

			const recentVersions = recentVersionsSnap.docs.map((doc) => ({
				id: doc.id,
				...(doc.data() as Statement),
			}));

			logger.info('[fn_pruneVersionHistory] Recent versions count', {
				paragraphId,
				count: recentVersions.length,
				maxRecentVersions,
			});

			// If more than maxRecentVersions, archive oldest
			if (recentVersions.length > maxRecentVersions) {
				const toArchive = recentVersions.slice(maxRecentVersions); // versions beyond max

				logger.info('[fn_pruneVersionHistory] Archiving old versions', {
					paragraphId,
					count: toArchive.length,
					versionRange: `${toArchive[toArchive.length - 1].versionControl?.currentVersion} to ${toArchive[0].versionControl?.currentVersion}`,
				});

				// Prepare data for compression
				const archiveData: VersionData[] = toArchive.map((v) => ({
					versionNumber: v.versionControl?.currentVersion || 0,
					text: v.statement,
					replacedAt: v.versionControl?.appliedAt || Date.now(),
					consensus: v.consensus || 0,
					finalizedBy: v.versionControl?.finalizedBy || '',
					adminEdited: !!v.versionControl?.adminEditedContent,
					adminNotes: v.versionControl?.adminNotes,
					replacedBy: v.versionControl?.appliedSuggestionId,
				}));

				// Compress with gzip
				const jsonString = JSON.stringify(archiveData);
				const compressed = pako.gzip(jsonString);
				const compressedBase64 = Buffer.from(compressed).toString('base64');

				// Calculate compression ratio
				const originalSize = Buffer.from(jsonString).length;
				const compressedSize = compressed.length;
				const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

				logger.info('[fn_pruneVersionHistory] Compression stats', {
					paragraphId,
					originalSize,
					compressedSize,
					compressionRatio: `${compressionRatio}%`,
				});

				// Create archive document
				const archiveId = `archive_${toArchive[toArchive.length - 1].versionControl?.currentVersion}_to_${toArchive[0].versionControl?.currentVersion}`;

				const archiveDoc: VersionArchive = {
					archiveId,
					startVersion: toArchive[toArchive.length - 1].versionControl?.currentVersion || 0,
					endVersion: toArchive[0].versionControl?.currentVersion || 0,
					compressedData: compressedBase64,
					createdAt: Date.now(),
				};

				await db
					.collection(Collections.statements)
					.doc(paragraphId)
					.collection('versionArchive')
					.doc(archiveId)
					.set(archiveDoc);

				// Delete from Tier 1 (full storage)
				const batch = db.batch();
				toArchive.forEach((v) => {
					batch.delete(db.collection(Collections.statements).doc(v.id));
				});
				await batch.commit();

				logger.info('[fn_pruneVersionHistory] Archived and deleted old versions', {
					paragraphId,
					archiveId,
					deletedCount: toArchive.length,
				});
			}

			// Check total version limit (Tier 1 + Tier 2)
			const archiveSnap = await db
				.collection(Collections.statements)
				.doc(paragraphId)
				.collection('versionArchive')
				.orderBy('startVersion', 'asc')
				.get();

			const totalVersions =
				recentVersions.length +
				archiveSnap.docs.reduce((sum, doc) => {
					const archive = doc.data() as VersionArchive;
					
return sum + (archive.endVersion - archive.startVersion + 1);
				}, 0);

			logger.info('[fn_pruneVersionHistory] Total versions check', {
				paragraphId,
				totalVersions,
				maxTotalVersions,
			});

			if (totalVersions > maxTotalVersions) {
				// Delete oldest archives
				const versionsToDelete = totalVersions - maxTotalVersions;
				let deletedCount = 0;
				const batch = db.batch();

				for (const archiveDoc of archiveSnap.docs) {
					if (deletedCount >= versionsToDelete) break;

					const archive = archiveDoc.data() as VersionArchive;
					const archiveSize = archive.endVersion - archive.startVersion + 1;

					batch.delete(archiveDoc.ref);
					deletedCount += archiveSize;
				}

				await batch.commit();

				logger.info('[fn_pruneVersionHistory] Deleted oldest archives', {
					paragraphId,
					deletedArchives: archiveSnap.docs.length,
					deletedVersions: deletedCount,
				});
			}

			return null;
		} catch (error) {
			logger.error('[fn_pruneVersionHistory] Error', {
				error: error instanceof Error ? error.message : String(error),
				paragraphId: event.params.paragraphId,
				stack: error instanceof Error ? error.stack : undefined,
			});
			// Don't throw - this is a background cleanup task

			return null;
		}
	}
);
