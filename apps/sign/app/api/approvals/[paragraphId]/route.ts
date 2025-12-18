import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

interface ApprovalInput {
  approval: boolean;
  documentId: string;
}

/**
 * GET /api/approvals/[paragraphId]
 * Get user's approval for a paragraph
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    const { paragraphId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const db = getFirestoreAdmin();
    const approvalId = `${userId}--${paragraphId}`;
    const doc = await db.collection(Collections.approval).doc(approvalId).get();

    if (!doc.exists) {
      return NextResponse.json({ approval: null });
    }

    return NextResponse.json({ approval: doc.data() });
  } catch (error) {
    logger.error('[Approvals API] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/approvals/[paragraphId]
 * Create or update user's approval for a paragraph
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    const { paragraphId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const body: ApprovalInput = await request.json();
    const { approval, documentId } = body;

    // Validate approval value
    if (typeof approval !== 'boolean') {
      return NextResponse.json(
        { error: 'Approval must be a boolean' },
        { status: 400 }
      );
    }

    if (!documentId) {
      return NextResponse.json(
        { error: 'documentId is required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();
    const approvalId = `${userId}--${paragraphId}`;

    // For embedded paragraphs, the topParentId is the documentId itself
    // We no longer look up individual paragraph documents since they're embedded
    const approvalData = {
      approvalId,
      statementId: documentId, // Reference to parent document
      paragraphId, // Reference to embedded paragraph
      documentId,
      topParentId: documentId,
      userId,
      approval,
      createdAt: Date.now(),
    };

    await db.collection(Collections.approval).doc(approvalId).set(approvalData);

    logger.info(`[Approvals API] Created/updated approval: ${approvalId} - ${approval}`);

    return NextResponse.json({ success: true, approval: approvalData });
  } catch (error) {
    logger.error('[Approvals API] POST error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/approvals/[paragraphId]
 * Remove user's approval for a paragraph
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    const { paragraphId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const db = getFirestoreAdmin();
    const approvalId = `${userId}--${paragraphId}`;

    await db.collection(Collections.approval).doc(approvalId).delete();

    logger.info(`[Approvals API] Deleted approval: ${approvalId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Approvals API] DELETE error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
