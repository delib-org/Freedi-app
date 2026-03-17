import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Collections, AdminPermissionLevel } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * Firebase Function URL for AI processing
 */
const FIREBASE_FUNCTION_URL =
	process.env.FIREBASE_FUNCTIONS_URL ||
	'https://me-west1-wizcol-app.cloudfunctions.net';

/**
 * GET /api/admin/refinement/[paragraphId]
 * Get paragraph refinement state (public - used by useRefinementPhase hook)
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ paragraphId: string }> }
): Promise<NextResponse> {
	try {
		const { paragraphId } = await params;
		const { db } = getFirebaseAdmin();

		const docRef = db.collection(Collections.statements).doc(paragraphId);
		const docSnap = await docRef.get();

		if (!docSnap.exists) {
			return NextResponse.json(
				{ error: 'Paragraph not found' },
				{ status: 404 }
			);
		}

		const data = docSnap.data();
		const refinement = data?.doc?.refinement || { phase: 'open' };

		return NextResponse.json(refinement);
	} catch (error) {
		logger.error('[Refinement API] GET error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

/**
 * PUT /api/admin/refinement/[paragraphId]
 * Set paragraph phase (open/refinement) - admin only
 * Body: { action: 'setPhase', phase: 'open' | 'refinement', consensusThreshold?: number }
 *   or: { action: 'synthesize', originalContent: string, suggestions: [...] }
 *   or: { action: 'improve', suggestionId: string, suggestionContent: string, comments: [...], originalParagraphContent: string }
 */
export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ paragraphId: string }> }
): Promise<NextResponse> {
	try {
		const { paragraphId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Get the paragraph to find the document ID
		const paragraphRef = db.collection(Collections.statements).doc(paragraphId);
		const paragraphSnap = await paragraphRef.get();

		if (!paragraphSnap.exists) {
			return NextResponse.json(
				{ error: 'Paragraph not found' },
				{ status: 404 }
			);
		}

		const paragraphData = paragraphSnap.data();
		const documentId = paragraphData?.topParentId || paragraphData?.parentId;

		if (!documentId) {
			return NextResponse.json(
				{ error: 'Could not determine document ID' },
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

		const body = await request.json();
		const { action } = body;

		switch (action) {
			case 'setPhase':
				return handleSetPhase(paragraphRef, body, userId);
			case 'synthesize':
				return handleSynthesize(paragraphId, body);
			case 'improve':
				return handleImprove(body);
			default:
				return NextResponse.json(
					{ error: 'Invalid action. Must be "setPhase", "synthesize", or "improve".' },
					{ status: 400 }
				);
		}
	} catch (error) {
		logger.error('[Refinement API] PUT error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

/**
 * Set paragraph refinement phase
 */
async function handleSetPhase(
	paragraphRef: FirebaseFirestore.DocumentReference,
	body: { phase?: string; consensusThreshold?: number },
	userId: string,
): Promise<NextResponse> {
	const { phase, consensusThreshold } = body;

	if (phase !== 'open' && phase !== 'refinement') {
		return NextResponse.json(
			{ error: 'Phase must be "open" or "refinement"' },
			{ status: 400 }
		);
	}

	const refinement = {
		phase,
		transitionedAt: Date.now(),
		transitionedBy: userId,
		...(typeof consensusThreshold === 'number' && { consensusThreshold }),
	};

	await paragraphRef.update({
		'doc.refinement': refinement,
		lastUpdate: Date.now(),
	});

	logger.info(`[Refinement API] Phase set to "${phase}" for paragraph ${paragraphRef.id}`);

	return NextResponse.json({ success: true, refinement });
}

/**
 * Trigger AI synthesis via Firebase Function
 */
async function handleSynthesize(
	paragraphId: string,
	body: {
		originalContent?: string;
		suggestions?: Array<{
			suggestionId: string;
			suggestedContent: string;
			consensus: number;
			creatorDisplayName: string;
		}>;
	},
): Promise<NextResponse> {
	const { originalContent, suggestions } = body;

	if (!originalContent || !suggestions?.length) {
		return NextResponse.json(
			{ error: 'originalContent and suggestions are required' },
			{ status: 400 }
		);
	}

	const functionUrl = `${FIREBASE_FUNCTION_URL}/processRefinementAI`;

	const response = await fetch(functionUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			operation: 'synthesize',
			paragraphId,
			originalContent,
			suggestions,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		let errorData: { error?: string } = { error: 'AI synthesis failed' };
		try {
			errorData = JSON.parse(errorText);
		} catch {
			errorData = { error: errorText || 'AI synthesis failed' };
		}
		logger.error(`[Refinement API] Synthesis Firebase Function error: ${response.status}`, errorData);

		return NextResponse.json(
			{ error: errorData.error || 'AI synthesis failed' },
			{ status: response.status }
		);
	}

	const result = await response.json();

	return NextResponse.json(result);
}

/**
 * Trigger AI improvement via Firebase Function
 */
async function handleImprove(
	body: {
		suggestionId?: string;
		suggestionContent?: string;
		comments?: Array<{
			commentId: string;
			content: string;
			consensus: number;
			creatorDisplayName: string;
		}>;
		originalParagraphContent?: string;
	},
): Promise<NextResponse> {
	const { suggestionId, suggestionContent, comments, originalParagraphContent } = body;

	if (!suggestionId || !suggestionContent || !comments?.length) {
		return NextResponse.json(
			{ error: 'suggestionId, suggestionContent, and comments are required' },
			{ status: 400 }
		);
	}

	const functionUrl = `${FIREBASE_FUNCTION_URL}/processRefinementAI`;

	const response = await fetch(functionUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			operation: 'improve',
			suggestionId,
			suggestionContent,
			comments,
			originalParagraphContent: originalParagraphContent || '',
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		let errorData: { error?: string } = { error: 'AI improvement failed' };
		try {
			errorData = JSON.parse(errorText);
		} catch {
			errorData = { error: errorText || 'AI improvement failed' };
		}
		logger.error(`[Refinement API] Improve Firebase Function error: ${response.status}`, errorData);

		return NextResponse.json(
			{ error: errorData.error || 'AI improvement failed' },
			{ status: response.status }
		);
	}

	const result = await response.json();

	return NextResponse.json(result);
}
