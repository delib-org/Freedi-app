import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import {
	Collections,
	AdminPermissionLevel,
	DocumentVersion,
	VersionChange,
	VersionStatus,
	ChangeDecision,
	ChangeType,
	IncoherenceRecord,
	Paragraph,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import * as v from 'valibot';

/**
 * Valibot schema for publish input
 */
const PublishInputSchema = v.object({
	applyToDocument: v.optional(v.boolean()),
});

type PublishInput = v.InferOutput<typeof PublishInputSchema>;

/**
 * POST /api/admin/versions/[docId]/[versionId]/publish
 * Publish a draft version and optionally apply it to the document
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string; versionId: string }> }
): Promise<NextResponse> {
	try {
		const { docId, versionId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Check admin access - must be admin or owner
		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Get the version
		const versionRef = db.collection(Collections.documentVersions).doc(versionId);
		const versionSnap = await versionRef.get();

		if (!versionSnap.exists) {
			return NextResponse.json(
				{ error: 'Version not found' },
				{ status: 404 }
			);
		}

		const version = versionSnap.data() as DocumentVersion;

		// Verify version belongs to document
		if (version.documentId !== docId) {
			return NextResponse.json(
				{ error: 'Version does not belong to this document' },
				{ status: 400 }
			);
		}

		// Only draft versions can be published
		if (version.status !== VersionStatus.draft) {
			return NextResponse.json(
				{ error: 'Only draft versions can be published' },
				{ status: 400 }
			);
		}

		// Parse and validate request body
		let body: PublishInput;
		try {
			const rawBody = await request.json().catch(() => ({}));
			body = v.parse(PublishInputSchema, rawBody);
		} catch (validationError) {
			const issues = validationError instanceof v.ValiError ? validationError.issues : [];
			return NextResponse.json(
				{
					error: 'Invalid request body',
					details: issues.map((issue: v.BaseIssue<unknown>) => ({
						path: issue.path?.map((p) => String(p.key)).join('.'),
						message: issue.message,
					})),
				},
				{ status: 400 }
			);
		}

		const applyToDocument = body.applyToDocument ?? true;

		// Get the original document paragraphs as the base
		const docRef = db.collection(Collections.statements).doc(docId);
		const docSnap = await docRef.get();
		const originalParagraphs: Paragraph[] = docSnap.exists ? (docSnap.data()?.paragraphs || []) : (version.paragraphs || []);

		// Get all version changes and apply only approved/modified ones
		const changesSnapshot = await db
			.collection(Collections.versionChanges)
			.where('versionId', '==', versionId)
			.get();

		const changes = changesSnapshot.docs.map((doc) => doc.data() as VersionChange);

		// Build final paragraphs: start with original, apply approved changes
		let finalParagraphs: Paragraph[] = originalParagraphs.map((paragraph) => {
			const change = changes.find((c) => c.paragraphId === paragraph.paragraphId);

			if (!change) return paragraph;

			// Only apply approved or modified changes
			if (change.adminDecision === ChangeDecision.approved) {
				return { ...paragraph, content: change.proposedContent };
			}

			if (change.adminDecision === ChangeDecision.modified && change.finalContent) {
				return { ...paragraph, content: change.finalContent };
			}

			// Rejected or pending changes: keep original content
			return paragraph;
		});

		// Handle added paragraphs (approved new paragraphs from holistic analysis)
		const addedChanges = changes.filter(
			(c) => c.changeType === ChangeType.added && c.adminDecision === ChangeDecision.approved
		);
		for (const addedChange of addedChanges) {
			finalParagraphs.push({
				paragraphId: addedChange.paragraphId,
				content: addedChange.proposedContent,
				order: finalParagraphs.length,
			} as Paragraph);
		}

		// Handle removed paragraphs (approved removals)
		const removedParagraphIds = new Set(
			changes
				.filter((c) => c.changeType === ChangeType.removed && c.adminDecision === ChangeDecision.approved)
				.map((c) => c.paragraphId)
		);
		if (removedParagraphIds.size > 0) {
			finalParagraphs = finalParagraphs.filter((p) => !removedParagraphIds.has(p.paragraphId));
		}

		// Apply approved coherence fixes on top
		const approvedFixesSnapshot = await db
			.collection(Collections.coherenceRecords)
			.where('versionId', '==', versionId)
			.where('adminDecision', '==', ChangeDecision.approved)
			.get();

		if (!approvedFixesSnapshot.empty) {
			const approvedFixes = approvedFixesSnapshot.docs.map(
				(doc) => doc.data() as IncoherenceRecord
			);

			finalParagraphs = finalParagraphs.map((paragraph) => {
				const fix = approvedFixes.find(
					(f) => f.primaryParagraphId === paragraph.paragraphId
				);

				if (fix && fix.suggestedFix) {
					return { ...paragraph, content: fix.suggestedFix };
				}

				return paragraph;
			});
		}

		// Apply modified coherence fixes
		const modifiedFixesSnapshot = await db
			.collection(Collections.coherenceRecords)
			.where('versionId', '==', versionId)
			.where('adminDecision', '==', ChangeDecision.modified)
			.get();

		if (!modifiedFixesSnapshot.empty) {
			const modifiedFixes = modifiedFixesSnapshot.docs.map(
				(doc) => doc.data() as IncoherenceRecord
			);

			finalParagraphs = finalParagraphs.map((paragraph) => {
				const fix = modifiedFixes.find(
					(f) => f.primaryParagraphId === paragraph.paragraphId
				);

				if (fix && fix.suggestedFix) {
					return { ...paragraph, content: fix.suggestedFix };
				}

				return paragraph;
			});
		}

		const batch = db.batch();
		const now = Date.now();

		// Archive any currently published version
		const publishedSnapshot = await db
			.collection(Collections.documentVersions)
			.where('documentId', '==', docId)
			.where('status', '==', VersionStatus.published)
			.get();

		publishedSnapshot.docs.forEach((doc) => {
			batch.update(doc.ref, { status: VersionStatus.archived });
		});

		// Publish this version (with coherence fixes applied)
		batch.update(versionRef, {
			status: VersionStatus.published,
			publishedAt: now,
			publishedBy: userId,
			paragraphs: finalParagraphs,
		});

		// Optionally apply paragraphs to the main document
		if (applyToDocument && finalParagraphs.length) {
			const docRef = db.collection(Collections.statements).doc(docId);
			batch.update(docRef, {
				paragraphs: finalParagraphs,
				lastUpdate: now,
			});
		}

		await batch.commit();

		logger.info(`[Versions API] Published version ${versionId}, applied to document: ${applyToDocument}`);

		// Return updated version
		const updatedVersionSnap = await versionRef.get();
		const updatedVersion = updatedVersionSnap.data() as DocumentVersion;

		return NextResponse.json({
			success: true,
			version: updatedVersion,
			appliedToDocument: applyToDocument,
		});
	} catch (error) {
		logger.error('[Versions API] Publish error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
