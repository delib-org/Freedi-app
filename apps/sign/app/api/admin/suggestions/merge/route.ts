/**
 * POST /api/admin/suggestions/merge
 *
 * Publish an AI-merged text as a new suggestion (not as a new version).
 * Unlike accept-text, this does NOT promote the text — it creates a regular
 * suggestion that the community can vote on.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Collections } from '@freedi/shared-types';
import { createSuggestionStatement } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

interface MergeRequest {
	paragraphId: string;
	documentId: string;
	mergedText: string;
	reasoning?: string;
	sourceSuggestionIds: string[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const cookieHeader = request.headers.get('cookie');
		const userId = getUserIdFromCookie(cookieHeader);

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body: MergeRequest = await request.json();
		const { paragraphId, documentId, mergedText, reasoning, sourceSuggestionIds } = body;

		if (!documentId || !paragraphId || !mergedText?.trim()) {
			return NextResponse.json(
				{ error: 'documentId, paragraphId, and mergedText are required' },
				{ status: 400 }
			);
		}

		if (!sourceSuggestionIds || sourceSuggestionIds.length < 2) {
			return NextResponse.json(
				{ error: 'At least 2 source suggestion IDs are required' },
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

		// Create the suggestion statement
		const displayName = getUserDisplayNameFromCookie(cookieHeader) || getAnonymousDisplayName(userId);
		const creator = {
			uid: userId,
			displayName,
			email: '',
			photoURL: '',
			isAnonymous: false,
		};

		const suggestionStatement = createSuggestionStatement(
			mergedText.trim(),
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

		// Mark as AI-generated merge with source IDs
		const statementWithMerge = {
			...suggestionStatement,
			doc: {
				...(suggestionStatement.doc as Record<string, unknown> || {}),
				isAIGenerated: true,
				aiSourceSuggestionIds: sourceSuggestionIds,
			},
		};

		// Write to Firestore — real-time listener will pick it up automatically
		await db.collection(Collections.statements).doc(statementWithMerge.statementId).set(statementWithMerge);

		logger.info('[Merge API] AI merge published as suggestion', {
			paragraphId,
			suggestionId: statementWithMerge.statementId,
			sourceCount: sourceSuggestionIds.length,
		});

		return NextResponse.json({
			success: true,
			suggestionId: statementWithMerge.statementId,
		});
	} catch (error) {
		logger.error('[Merge API] Error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
