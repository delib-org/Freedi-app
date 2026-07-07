import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { logger } from '@/lib/utils/logger';
import {
	clearTestData,
	purgeUserData,
	deleteStatement,
	restoreBatch,
	listBatches,
} from '@/lib/admin/dataManagement';
import { banUser, unbanUser, listBlockedUsers } from '@/lib/admin/blocklist';

/**
 * GET /api/admin/data-management/[docId]
 * Returns deletion batches (recycle bin) + blocked users for the document.
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
	try {
		const { docId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { db } = getFirebaseAdmin();
		const access = await checkAdminAccess(db, docId, userId);

		if (!access.isAdmin || access.isViewer) {
			return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
		}

		const { searchParams } = new URL(request.url);
		const includeRestored = searchParams.get('includeRestored') === 'true';

		const [batches, blockedUsers] = await Promise.all([
			listBatches(db, docId, includeRestored),
			listBlockedUsers(db, docId),
		]);

		return NextResponse.json({ batches, blockedUsers });
	} catch (error) {
		logger.error('[API] Data-management GET failed:', error);

		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

interface DataManagementRequest {
	action: 'clearTestData' | 'purgeUser' | 'deleteStatement' | 'restore' | 'ban' | 'unban';
	targetUserId?: string;
	targetUserName?: string;
	statementId?: string;
	batchId?: string;
	/** For clearTestData: the document title, typed by the admin to confirm. */
	confirmTitle?: string;
}

/**
 * POST /api/admin/data-management/[docId]
 * Destructive admin actions. All deletions are recoverable via `restore`.
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
	try {
		const { docId } = await params;
		const cookieHeader = request.headers.get('cookie');
		const userId = getUserIdFromCookie(cookieHeader);

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { db } = getFirebaseAdmin();
		const access = await checkAdminAccess(db, docId, userId);

		if (!access.isAdmin || access.isViewer) {
			return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
		}

		const body: DataManagementRequest = await request.json();
		const adminName = getUserDisplayNameFromCookie(cookieHeader) || undefined;
		const now = Date.now();

		switch (body.action) {
			case 'clearTestData': {
				const result = await clearTestData(db, docId, userId, adminName, now);

				return NextResponse.json({ success: true, ...result });
			}

			case 'purgeUser': {
				if (!body.targetUserId) {
					return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
				}
				const result = await purgeUserData(db, docId, body.targetUserId, userId, adminName, now);

				return NextResponse.json({ success: true, ...result });
			}

			case 'deleteStatement': {
				if (!body.statementId) {
					return NextResponse.json({ error: 'statementId is required' }, { status: 400 });
				}
				const result = await deleteStatement(db, docId, body.statementId, userId, adminName, now);

				return NextResponse.json({ success: true, ...result });
			}

			case 'restore': {
				if (!body.batchId) {
					return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
				}
				const result = await restoreBatch(db, docId, body.batchId, userId, now);

				return NextResponse.json({ success: true, ...result });
			}

			case 'ban': {
				if (!body.targetUserId) {
					return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
				}
				await banUser(db, docId, body.targetUserId, userId, body.targetUserName, now);

				return NextResponse.json({ success: true });
			}

			case 'unban': {
				if (!body.targetUserId) {
					return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
				}
				await unbanUser(db, docId, body.targetUserId);

				return NextResponse.json({ success: true });
			}

			default:
				return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
		}
	} catch (error) {
		logger.error('[API] Data-management POST failed:', error);
		const message = error instanceof Error ? error.message : 'Internal server error';

		return NextResponse.json({ error: message }, { status: 500 });
	}
}
