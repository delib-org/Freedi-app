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
	Paragraph,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import {
	processVersionChanges,
	isAIConfigured,
	getDefaultAIConfig,
} from '@/lib/ai/versionGenerator';
import { logError } from '@/lib/utils/errorHandling';

/**
 * POST /api/admin/versions/[docId]/[versionId]/process-ai
 * Process changes through AI to generate proposed content
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

		// Check admin access
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

		if (version.documentId !== docId) {
			return NextResponse.json(
				{ error: 'Version does not belong to this document' },
				{ status: 400 }
			);
		}

		if (version.status !== VersionStatus.draft) {
			return NextResponse.json(
				{ error: 'Only draft versions can be processed' },
				{ status: 400 }
			);
		}

		// Security: Only use server-side AI configuration
		// Do NOT accept API keys from client requests
		if (!isAIConfigured()) {
			return NextResponse.json(
				{
					error: 'AI not configured. Please configure AI_PROVIDER and OPENAI_API_KEY or ANTHROPIC_API_KEY environment variables on the server.',
				},
				{ status: 400 }
			);
		}

		// Use server-side AI configuration only
		const aiConfig = getDefaultAIConfig();

		// Get changes for this version
		const changesSnapshot = await db
			.collection(Collections.versionChanges)
			.where('versionId', '==', versionId)
			.get();

		const changes = changesSnapshot.docs.map((doc) => doc.data() as VersionChange);

		if (changes.length === 0) {
			return NextResponse.json(
				{ error: 'No changes found for this version. Run generate first.' },
				{ status: 400 }
			);
		}

		// Get paragraphs
		const paragraphs: Paragraph[] = version.paragraphs || [];

		if (paragraphs.length === 0) {
			return NextResponse.json(
				{ error: 'Version has no paragraphs' },
				{ status: 400 }
			);
		}

		// Process through AI
		logger.info(`[Process AI] Starting AI processing for version ${versionId}`);

		const result = await processVersionChanges(changes, paragraphs, aiConfig);

		// Update changes in database
		const batch = db.batch();

		for (const change of result.updatedChanges) {
			const changeRef = db.collection(Collections.versionChanges).doc(change.changeId);
			batch.update(changeRef, {
				proposedContent: change.proposedContent,
				aiReasoning: change.aiReasoning,
			});
		}

		// Update version with processed paragraphs and summary
		batch.update(versionRef, {
			paragraphs: result.updatedParagraphs,
			summary: result.summary,
			aiModel: aiConfig?.model || 'default',
		});

		await batch.commit();

		logger.info(`[Process AI] Completed AI processing for version ${versionId}`);

		return NextResponse.json({
			success: true,
			summary: result.summary,
			processedChanges: result.updatedChanges.filter(
				(c) => c.aiReasoning && c.aiReasoning.length > 0
			).length,
			totalChanges: changes.length,
		});
	} catch (error) {
		const { docId, versionId } = await params;
		logError(error, {
			operation: 'api.versions.processAI',
			documentId: docId,
			metadata: { versionId },
		});

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
