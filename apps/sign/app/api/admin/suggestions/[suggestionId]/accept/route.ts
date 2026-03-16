/**
 * POST /api/admin/suggestions/[suggestionId]/accept
 *
 * Accept a suggestion to replace a paragraph, with full versioning:
 * - Creates version history entry for the old text
 * - Updates paragraph with suggestion text
 * - Marks winning suggestion as promoted
 * - Marks other suggestions with forVersion
 * - Resets evaluations for fresh voting on new text
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Collections, Statement, StatementType, ReplacementQueueStatus, PendingReplacement } from '@freedi/shared-types';
import { executeReplacement } from '@/controllers/versionControl/executeReplacement';
import { logger } from '@/lib/utils/logger';

interface AcceptRequest {
	documentId: string;
	paragraphId: string;
}

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ suggestionId: string }> }
): Promise<NextResponse> {
	try {
		const { suggestionId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body: AcceptRequest = await request.json();
		const { documentId, paragraphId } = body;

		if (!documentId || !paragraphId) {
			return NextResponse.json(
				{ error: 'documentId and paragraphId are required' },
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

		// Get the suggestion
		const suggestionRef = db.collection(Collections.statements).doc(suggestionId);
		const suggestionSnap = await suggestionRef.get();

		if (!suggestionSnap.exists) {
			return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
		}

		const suggestion = suggestionSnap.data() as Statement;

		// Verify it's actually a suggestion for this paragraph
		if (suggestion.parentId !== paragraphId || suggestion.statementType !== StatementType.option) {
			return NextResponse.json(
				{ error: 'This is not a suggestion for the specified paragraph' },
				{ status: 400 }
			);
		}

		// Get the paragraph to build a PendingReplacement-like object
		const paragraphRef = db.collection(Collections.statements).doc(paragraphId);
		const paragraphSnap = await paragraphRef.get();

		if (!paragraphSnap.exists) {
			return NextResponse.json({ error: 'Paragraph not found' }, { status: 404 });
		}

		const paragraph = paragraphSnap.data() as Statement;

		// Build a PendingReplacement object for executeReplacement
		const queueItem: PendingReplacement = {
			queueId: `direct_accept_${suggestionId}`,
			documentId,
			paragraphId,
			suggestionId,
			currentText: paragraph.statement,
			proposedText: suggestion.statement,
			consensus: suggestion.consensus || 0,
			consensusAtCreation: suggestion.consensus || 0,
			evaluationCount: suggestion.evaluation?.numberOfEvaluators || 0,
			positiveEvaluations: suggestion.evaluation?.numberOfProEvaluators || 0,
			negativeEvaluations: suggestion.evaluation?.numberOfConEvaluators || 0,
			createdAt: Date.now(),
			creatorId: suggestion.creatorId,
			creatorDisplayName: suggestion.creator?.displayName || 'Anonymous',
			status: ReplacementQueueStatus.pending,
		};

		// Execute versioned replacement
		const result = await executeReplacement({
			db,
			queueItem,
			userId,
		});

		if (!result.success) {
			return NextResponse.json(
				{ error: result.error || 'Failed to accept suggestion' },
				{ status: 500 }
			);
		}

		logger.info('[Accept Suggestion API] Suggestion accepted with versioning', {
			suggestionId,
			paragraphId,
			newVersion: result.newVersion,
		});

		return NextResponse.json({
			success: true,
			newVersion: result.newVersion,
		});
	} catch (error) {
		logger.error('[Accept Suggestion API] Error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
