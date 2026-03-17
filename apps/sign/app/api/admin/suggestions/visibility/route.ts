/**
 * POST /api/admin/suggestions/visibility
 *
 * Admin endpoint to show only selected suggestions by hiding all others.
 * Also supports unhiding all suggestions for a paragraph.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Collections, StatementType } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

interface VisibilityRequest {
	paragraphId: string;
	documentId: string;
	/** IDs of suggestions to keep visible. If empty, unhide all. */
	visibleSuggestionIds: string[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const cookieHeader = request.headers.get('cookie');
		const userId = getUserIdFromCookie(cookieHeader);

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body: VisibilityRequest = await request.json();
		const { paragraphId, documentId, visibleSuggestionIds } = body;

		if (!documentId || !paragraphId) {
			return NextResponse.json(
				{ error: 'documentId and paragraphId are required' },
				{ status: 400 }
			);
		}

		if (!Array.isArray(visibleSuggestionIds)) {
			return NextResponse.json(
				{ error: 'visibleSuggestionIds must be an array' },
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

		// Get all suggestions for this paragraph
		const suggestionsSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', paragraphId)
			.where('statementType', '==', StatementType.option)
			.get();

		if (suggestionsSnapshot.empty) {
			return NextResponse.json({ success: true, hiddenCount: 0, shownCount: 0 });
		}

		const visibleSet = new Set(visibleSuggestionIds);
		const now = Date.now();
		const batch = db.batch();
		let hiddenCount = 0;
		let shownCount = 0;

		for (const docSnap of suggestionsSnapshot.docs) {
			const isSelected = visibleSet.has(docSnap.id);

			// If visibleSuggestionIds is empty, unhide all (reset)
			if (visibleSuggestionIds.length === 0) {
				if (docSnap.data().hide === true) {
					batch.update(docSnap.ref, { hide: false, lastUpdate: now });
					shownCount++;
				}
			} else if (isSelected) {
				// Ensure selected ones are visible
				if (docSnap.data().hide === true) {
					batch.update(docSnap.ref, { hide: false, lastUpdate: now });
					shownCount++;
				}
			} else {
				// Hide unselected ones
				if (docSnap.data().hide !== true) {
					batch.update(docSnap.ref, { hide: true, lastUpdate: now });
					hiddenCount++;
				}
			}
		}

		await batch.commit();

		logger.info(`[Admin Suggestions] Visibility update for paragraph ${paragraphId}: ${hiddenCount} hidden, ${shownCount} shown`);

		return NextResponse.json({ success: true, hiddenCount, shownCount });
	} catch (error) {
		logger.error('[Admin Suggestions] Visibility error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
