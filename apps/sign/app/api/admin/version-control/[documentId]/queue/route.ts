import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections, PendingReplacement, ReplacementQueueStatus } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { verifyAdmin } from '@/lib/utils/versionControlHelpers';

/**
 * GET /api/admin/version-control/[documentId]/queue
 * Get pending replacement queue items for a document
 *
 * Query params:
 * - sortBy: 'consensus' | 'createdAt' | 'evaluationCount' (default: 'consensus')
 * - order: 'asc' | 'desc' (default: 'desc')
 * - status: 'pending' | 'approved' | 'rejected' | 'superseded' (default: 'pending')
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ documentId: string }> }
): Promise<NextResponse> {
	try {
		const { documentId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		// Verify admin access
		const db = getFirestoreAdmin();
		await verifyAdmin(db, documentId, userId);

		// Parse query parameters
		const { searchParams } = new URL(request.url);
		const sortBy = searchParams.get('sortBy') || 'consensus';
		const order = searchParams.get('order') || 'desc';
		const status = (searchParams.get('status') || 'pending') as ReplacementQueueStatus;

		// Validate sortBy
		const validSortFields = ['consensus', 'createdAt', 'evaluationCount'];
		if (!validSortFields.includes(sortBy)) {
			return NextResponse.json(
				{
					error: `Invalid sortBy parameter. Must be one of: ${validSortFields.join(', ')}`,
				},
				{ status: 400 }
			);
		}

		// Validate order
		if (order !== 'asc' && order !== 'desc') {
			return NextResponse.json(
				{ error: 'Invalid order parameter. Must be asc or desc' },
				{ status: 400 }
			);
		}

		// Build query
		let query = db
			.collection(Collections.paragraphReplacementQueue)
			.where('documentId', '==', documentId)
			.where('status', '==', status);

		// Add sorting
		query = query.orderBy(sortBy, order as 'asc' | 'desc');

		// Execute query
		const queueSnap = await query.get();

		const queue: PendingReplacement[] = queueSnap.docs.map(
			(doc) => doc.data() as PendingReplacement
		);

		logger.info('[Queue API] Queue fetched', {
			documentId,
			count: queue.length,
			sortBy,
			order,
			status,
		});

		return NextResponse.json({ success: true, queue, count: queue.length });
	} catch (error) {
		logger.error('[Queue API] GET error:', error);

		if (error instanceof Error) {
			if (error.message.includes('not authenticated')) {
				return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
			}
			if (error.message.includes('not an admin')) {
				return NextResponse.json(
					{ error: 'Forbidden - Admin access required' },
					{ status: 403 }
				);
			}
		}

		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
