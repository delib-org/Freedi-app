import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections, ReplacementQueueStatus } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/admin/version-control/queue/[documentId]
 * Get pending replacement queue for a document
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ documentId: string }> }
) {
	try {
		const { documentId } = await params;
		const cookieHeader = request.headers.get('cookie');
		const userId = getUserIdFromCookie(cookieHeader);

		if (!userId) {
			return NextResponse.json(
				{ error: 'User not authenticated' },
				{ status: 401 }
			);
		}

		const db = getFirestoreAdmin();

		// Check if user is admin of this document
		const subscriptionId = `${userId}--${documentId}`;
		const subscriptionDoc = await db
			.collection(Collections.statementsSubscribe)
			.doc(subscriptionId)
			.get();

		if (!subscriptionDoc.exists) {
			return NextResponse.json(
				{ error: 'Not authorized - no subscription found' },
				{ status: 403 }
			);
		}

		const subscription = subscriptionDoc.data();
		if (subscription?.role !== 'admin' && subscription?.role !== 'statement-creator') {
			return NextResponse.json(
				{ error: 'Not authorized - admin access required' },
				{ status: 403 }
			);
		}

		// Get sort parameters
		const { searchParams } = new URL(request.url);
		const sortBy = searchParams.get('sortBy') || 'consensus';
		const order = searchParams.get('order') || 'desc';

		// Query pending replacements
		const snapshot = await db
			.collection(Collections.paragraphReplacementQueue)
			.where('documentId', '==', documentId)
			.where('status', '==', ReplacementQueueStatus.pending)
			.orderBy(sortBy, order as 'asc' | 'desc')
			.get();

		const queue = snapshot.docs.map((doc) => doc.data());

		return NextResponse.json({ queue });
	} catch (error) {
		logger.error('[Version Control Queue API] GET error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
