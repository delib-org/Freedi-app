import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections, DocumentActionHistory, AuditAction } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { verifyAdmin, logAudit } from '@/lib/utils/versionControlHelpers';
import { undoParagraphRemoval } from '@/controllers/versionControl/executeParagraphRemoval';
import { undoParagraphAddition } from '@/controllers/versionControl/executeParagraphAddition';

const COOLDOWN_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * POST /api/admin/version-control/[documentId]/undo
 * Undo an auto-executed consensus action (removal or addition)
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ documentId: string }> }
): Promise<NextResponse> {
	try {
		const { documentId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Verify admin access
		const db = getFirestoreAdmin();
		const adminCheck = await verifyAdmin(db, documentId, userId);
		if (!adminCheck.isAdmin) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
		}

		const body = await request.json();
		const { actionId } = body;

		if (!actionId || typeof actionId !== 'string') {
			return NextResponse.json({ error: 'actionId is required' }, { status: 400 });
		}

		// Get the action
		const actionRef = db.collection(Collections.documentActionHistory).doc(actionId);
		const actionSnap = await actionRef.get();

		if (!actionSnap.exists) {
			return NextResponse.json({ error: 'Action not found' }, { status: 404 });
		}

		const action = actionSnap.data() as DocumentActionHistory;

		if (action.documentId !== documentId) {
			return NextResponse.json({ error: 'Action does not belong to this document' }, { status: 400 });
		}

		if (action.undoneAt) {
			return NextResponse.json({ error: 'Action already undone' }, { status: 409 });
		}

		let result: { success: boolean; error?: string };

		switch (action.actionType) {
			case 'remove':
				result = await undoParagraphRemoval({ db, actionId, userId });
				break;
			case 'add':
				result = await undoParagraphAddition({ db, actionId, userId });
				break;
			default:
				return NextResponse.json({ error: `Unsupported action type: ${action.actionType}` }, { status: 400 });
		}

		if (!result.success) {
			return NextResponse.json({ error: result.error || 'Undo failed' }, { status: 500 });
		}

		// Log audit
		await logAudit(db, {
			documentId,
			paragraphId: action.paragraphId,
			userId,
			action: AuditAction.rollback_executed,
			metadata: {
				notes: `Undid ${action.actionType} action ${actionId}`,
				consensus: action.consensus,
			},
		});

		logger.info('[undo] Action undone successfully', {
			actionId,
			actionType: action.actionType,
			documentId,
			userId,
		});

		return NextResponse.json({
			success: true,
			actionType: action.actionType,
			cooldownUntil: action.actionType === 'remove' ? Date.now() + COOLDOWN_DURATION_MS : undefined,
		});
	} catch (error) {
		logger.error('[undo] Error', {
			error: error instanceof Error ? error.message : String(error),
		});

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
