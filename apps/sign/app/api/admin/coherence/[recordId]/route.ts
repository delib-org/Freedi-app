import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import {
	Collections,
	AdminPermissionLevel,
	ChangeDecision,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import * as v from 'valibot';

const ReviewInputSchema = v.object({
	adminDecision: v.enum_(ChangeDecision),
	adminNote: v.optional(v.string()),
	modifiedFix: v.optional(v.string()),
});

/**
 * PUT /api/admin/coherence/[recordId]
 * Admin reviews a coherence record (approve/reject/modify fix)
 */
export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ recordId: string }> }
): Promise<NextResponse> {
	try {
		const { recordId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Get the record to find the documentId for access check
		const recordRef = db.collection(Collections.coherenceRecords).doc(recordId);
		const recordSnap = await recordRef.get();

		if (!recordSnap.exists) {
			return NextResponse.json(
				{ error: 'Coherence record not found' },
				{ status: 404 }
			);
		}

		const record = recordSnap.data();
		const documentId = record?.documentId as string;

		if (!documentId) {
			return NextResponse.json(
				{ error: 'Record has no associated document' },
				{ status: 400 }
			);
		}

		// Check admin access
		const accessResult = await checkAdminAccess(db, documentId, userId);

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Parse and validate body
		let body: v.InferOutput<typeof ReviewInputSchema>;
		try {
			const rawBody = await request.json();
			body = v.parse(ReviewInputSchema, rawBody);
		} catch (validationError) {
			const issues = validationError instanceof v.ValiError ? validationError.issues : [];

			return NextResponse.json(
				{
					error: 'Invalid request body',
					details: issues.map((issue: v.BaseIssue<unknown>) => ({
						path: issue.path?.map((p) => String(p.key)).join('.'),
						message: issue.message,
					})),
				},
				{ status: 400 }
			);
		}

		const updateData: Record<string, unknown> = {
			adminDecision: body.adminDecision,
			adminReviewedAt: Date.now(),
			adminReviewedBy: userId,
		};

		if (body.adminNote) {
			updateData.adminNote = body.adminNote;
		}

		if (body.modifiedFix && body.adminDecision === ChangeDecision.modified) {
			updateData.suggestedFix = body.modifiedFix;
		}

		await recordRef.update(updateData);

		logger.info(
			`[Coherence API] Record ${recordId} reviewed: ${body.adminDecision}`
		);

		return NextResponse.json({
			success: true,
			recordId,
			adminDecision: body.adminDecision,
		});
	} catch (error) {
		logger.error('[Coherence API] PUT error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
