/**
 * POST /api/admin/suggestions/accept-text
 *
 * Accept arbitrary text (e.g. AI synthesis) as a new paragraph version.
 * Creates a temporary suggestion Statement and immediately promotes it
 * via the same executeReplacement logic used for normal accept.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Collections, ReplacementQueueStatus, PendingReplacement } from '@freedi/shared-types';
import { createSuggestionStatement } from '@freedi/shared-types';
import { executeReplacement } from '@/controllers/versionControl/executeReplacement';
import { logger } from '@/lib/utils/logger';

interface AcceptTextRequest {
	documentId: string;
	paragraphId: string;
	proposedText: string;
	reasoning?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const cookieHeader = request.headers.get('cookie');
		const userId = getUserIdFromCookie(cookieHeader);

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body: AcceptTextRequest = await request.json();
		const { documentId, paragraphId, proposedText, reasoning } = body;

		if (!documentId || !paragraphId || !proposedText?.trim()) {
			return NextResponse.json(
				{ error: 'documentId, paragraphId, and proposedText are required' },
				{ status: 400 }
			);
		}

		const db = getFirestoreAdmin();

		// Verify admin access
		const accessResult = await checkAdminAccess(db, documentId, userId);
		if (!accessResult.isAdmin || accessResult.isViewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Get the paragraph
		const paragraphRef = db.collection(Collections.statements).doc(paragraphId);
		const paragraphSnap = await paragraphRef.get();

		if (!paragraphSnap.exists) {
			return NextResponse.json({ error: 'Paragraph not found' }, { status: 404 });
		}

		const paragraph = paragraphSnap.data();
		if (!paragraph) {
			return NextResponse.json({ error: 'Paragraph data is empty' }, { status: 404 });
		}

		// Create a temporary suggestion Statement so executeReplacement can reference it
		const displayName = getUserDisplayNameFromCookie(cookieHeader) || getAnonymousDisplayName(userId);
		const creator = {
			uid: userId,
			displayName,
			email: '',
			photoURL: '',
			isAnonymous: false,
		};

		const suggestionStatement = createSuggestionStatement(
			proposedText.trim(),
			paragraphId,
			documentId,
			creator,
			reasoning?.trim()
		);

		if (!suggestionStatement) {
			return NextResponse.json(
				{ error: 'Failed to create suggestion statement' },
				{ status: 500 }
			);
		}

		// Mark as AI-generated
		const statementWithAI = {
			...suggestionStatement,
			doc: {
				...(suggestionStatement.doc as Record<string, unknown> || {}),
				isAIGenerated: true,
			},
		};

		// Write the suggestion to Firestore
		await db.collection(Collections.statements).doc(statementWithAI.statementId).set(statementWithAI);

		// Build PendingReplacement and execute
		const queueItem: PendingReplacement = {
			queueId: `synthesis_accept_${statementWithAI.statementId}`,
			documentId,
			paragraphId,
			suggestionId: statementWithAI.statementId,
			currentText: paragraph.statement as string,
			proposedText: proposedText.trim(),
			consensus: 0,
			consensusAtCreation: 0,
			evaluationCount: 0,
			positiveEvaluations: 0,
			negativeEvaluations: 0,
			createdAt: Date.now(),
			creatorId: userId,
			creatorDisplayName: displayName,
			status: ReplacementQueueStatus.pending,
		};

		const result = await executeReplacement({
			db,
			queueItem,
			userId,
		});

		if (!result.success) {
			return NextResponse.json(
				{ error: result.error || 'Failed to accept text' },
				{ status: 500 }
			);
		}

		logger.info('[Accept Text API] Text accepted with versioning', {
			paragraphId,
			newVersion: result.newVersion,
			isAISynthesis: true,
		});

		return NextResponse.json({
			success: true,
			newVersion: result.newVersion,
		});
	} catch (error) {
		logger.error('[Accept Text API] Error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
