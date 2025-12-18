import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess, getDocumentCollaborators } from '@/lib/utils/adminAccess';
import { Collections } from '@freedi/shared-types';
import { Statement } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/admin/collaborators/[docId]
 * Returns list of collaborators and document owner info
 * Accessible by any admin (owner, admin, or viewer)
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
	try {
		const { docId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Check admin access - any admin level can view collaborators
		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Get document to retrieve owner info
		const docRef = db.collection(Collections.statements).doc(docId);
		const docSnap = await docRef.get();

		if (!docSnap.exists) {
			return NextResponse.json(
				{ error: 'Document not found' },
				{ status: 404 }
			);
		}

		const document = docSnap.data() as Statement;

		// Get owner info
		const owner = {
			userId: document.creator?.uid || document.creatorId || '',
			displayName: document.creator?.displayName || 'Unknown',
			email: document.creator?.email || '',
		};

		// Get collaborators
		const collaborators = await getDocumentCollaborators(db, docId);

		return NextResponse.json({
			collaborators,
			owner,
			currentUserPermission: accessResult.permissionLevel,
			isOwner: accessResult.isOwner,
		});
	} catch (error) {
		logger.error('[API] Admin collaborators GET failed:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
