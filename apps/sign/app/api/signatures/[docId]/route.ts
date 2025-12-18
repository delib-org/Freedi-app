import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

interface SignatureInput {
  signed: 'signed' | 'rejected' | 'viewed';
  levelOfSignature?: number;
}

/**
 * GET /api/signatures/[docId]
 * Get user's signature for a document
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const db = getFirestoreAdmin();
    const signatureId = `${userId}--${docId}`;
    const doc = await db.collection(Collections.signatures).doc(signatureId).get();

    if (!doc.exists) {
      return NextResponse.json({ signature: null });
    }

    return NextResponse.json({ signature: doc.data() });
  } catch (error) {
    logger.error('[Signatures API] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/signatures/[docId]
 * Create or update user's signature for a document
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const body: SignatureInput = await request.json();
    const { signed, levelOfSignature } = body;

    // Validate signed value
    if (!['signed', 'rejected', 'viewed'].includes(signed)) {
      return NextResponse.json(
        { error: 'Invalid signature status' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();
    const signatureId = `${userId}--${docId}`;

    // Get existing signature to check if upgrading from 'viewed'
    const existingDoc = await db.collection(Collections.signatures).doc(signatureId).get();
    const existingSignature = existingDoc.exists ? existingDoc.data() : null;

    // Don't downgrade from signed/rejected to viewed
    if (
      signed === 'viewed' &&
      existingSignature &&
      (existingSignature.signed === 'signed' || existingSignature.signed === 'rejected')
    ) {
      return NextResponse.json({ signature: existingSignature });
    }

    // Get document info for topParentId and parentId
    const docRef = await db.collection(Collections.statements).doc(docId).get();
    const document = docRef.exists ? docRef.data() : null;

    const signature = {
      signatureId,
      documentId: docId,
      topParentId: document?.topParentId || docId,
      parentId: document?.parentId || docId,
      userId,
      signed,
      date: Date.now(),
      levelOfSignature: levelOfSignature ?? 0,
    };

    await db.collection(Collections.signatures).doc(signatureId).set(signature, { merge: true });

    logger.info(`[Signatures API] Created/updated signature: ${signatureId} - ${signed}`);

    return NextResponse.json({ success: true, signature });
  } catch (error) {
    logger.error('[Signatures API] POST error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
