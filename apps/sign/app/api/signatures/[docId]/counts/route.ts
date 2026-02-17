import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/signatures/[docId]/counts
 * Get aggregated signature counts for a document (signed vs rejected)
 * No authentication required - counts are public information
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;
    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.signatures)
      .where('documentId', '==', docId)
      .get();

    let signedCount = 0;
    let rejectedCount = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.signed === 'signed') {
        signedCount++;
      } else if (data.signed === 'rejected') {
        rejectedCount++;
      }
    });

    return NextResponse.json({ signedCount, rejectedCount });
  } catch (error) {
    logger.error('[Signature Counts API] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
