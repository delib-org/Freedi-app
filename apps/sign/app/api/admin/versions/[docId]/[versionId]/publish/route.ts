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

		// Get all version changes and apply only approved/modified ones
		const changesSnapshot = await db
			.collection(Collections.versionChanges)
			.where('versionId', '==', versionId)
			.get();

		const changes = changesSnapshot.docs.map((doc) => doc.data() as VersionChange);

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

		// Apply approved/modified changes to individual paragraph Statement documents
		if (applyToDocument) {
			for (const change of changes) {
				if (change.adminDecision === ChangeDecision.approved || change.adminDecision === ChangeDecision.modified) {
					const finalContent = change.adminDecision === ChangeDecision.modified && change.finalContent
						? change.finalContent
						: change.proposedContent;

					if (change.changeType === ChangeType.removed) {
						// Hide the paragraph statement
						const paragraphRef = db.collection(Collections.statements).doc(change.paragraphId);
						batch.update(paragraphRef, { hide: true, lastUpdate: now });
					} else {
						// Update the paragraph Statement document's text
						const paragraphRef = db.collection(Collections.statements).doc(change.paragraphId);
						batch.update(paragraphRef, {
							statement: finalContent,
							lastUpdate: now,
						});
					}
				}
			}
		}

		// Get final state of paragraphs for storing on the version record
		const paragraphsSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', docId)
			.where('doc.isOfficialParagraph', '==', true)
			.orderBy('doc.order', 'asc')
			.get();

		const finalParagraphs: Paragraph[] = paragraphsSnapshot.docs
			.filter(doc => !doc.data().hide)
			.map(doc => {
				const data = doc.data();

				return {
					paragraphId: data.statementId,
					content: data.statement,
					order: data.doc?.order ?? 0,
				} as Paragraph;
			});

		// Publish this version
		batch.update(versionRef, {
			status: VersionStatus.published,
			publishedAt: now,
			publishedBy: userId,
			paragraphs: finalParagraphs,
		});

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
