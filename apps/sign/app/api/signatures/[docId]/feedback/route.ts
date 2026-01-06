import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

interface FeedbackInput {
  reason: string;
}

/**
 * POST /api/signatures/[docId]/feedback
 * Update rejection reason for an existing rejected signature
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
  try {
    const { docId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const body: FeedbackInput = await request.json();
    const { reason } = body;

    // Validate reason is a string
    if (typeof reason !== 'string') {
      return NextResponse.json(
        { error: 'Invalid reason format' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();
    const signatureId = `${userId}--${docId}`;

    // Get existing signature
    const existingDoc = await db.collection(Collections.signatures).doc(signatureId).get();

    if (!existingDoc.exists) {
      return NextResponse.json(
        { error: 'Signature not found' },
        { status: 404 }
      );
    }

    const existingSignature = existingDoc.data();

    // Only allow updating rejection reason for rejected signatures
    if (existingSignature?.signed !== 'rejected') {
      return NextResponse.json(
        { error: 'Can only add feedback to rejected signatures' },
        { status: 400 }
      );
    }

    // Update the signature with the rejection reason
    await db.collection(Collections.signatures).doc(signatureId).update({
      rejectionReason: reason.trim(),
    });

    logger.info(`[Signatures API] Updated rejection reason for: ${signatureId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Signatures API] Feedback POST error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
