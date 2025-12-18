/**
 * API endpoint for managing paragraph settings
 * PATCH /api/admin/paragraphs/[paragraphId] - Toggle isNonInteractive
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Collections } from '@freedi/shared-types';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { Paragraph } from '@/types';
import { logger } from '@/lib/utils/logger';

interface PatchRequest {
  documentId: string;
  isNonInteractive: boolean;
}

interface PatchResponse {
  success: boolean;
  error?: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
): Promise<NextResponse<PatchResponse>> {
  try {
    const { paragraphId } = await params;

    // Get user from cookies
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json() as PatchRequest;
    const { documentId, isNonInteractive } = body;

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID is required' },
        { status: 400 }
      );
    }

    if (typeof isNonInteractive !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'isNonInteractive must be a boolean' },
        { status: 400 }
      );
    }

    // Get document and verify admin
    const { db } = getFirebaseAdmin();
    const docRef = db.collection(Collections.statements).doc(documentId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    const docData = docSnap.data();
    const isAdmin = docData?.creatorId === userId || docData?.creator?.uid === userId;

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to modify this document' },
        { status: 403 }
      );
    }

    // Get paragraphs and update the specific one
    const paragraphs: Paragraph[] = docData?.paragraphs || [];
    const paragraphIndex = paragraphs.findIndex(p => p.paragraphId === paragraphId);

    if (paragraphIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Paragraph not found' },
        { status: 404 }
      );
    }

    // Update the paragraph
    paragraphs[paragraphIndex] = {
      ...paragraphs[paragraphIndex],
      isNonInteractive,
    };

    // Save to Firestore
    await docRef.update({
      paragraphs,
      lastUpdate: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating paragraph:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to update paragraph' },
      { status: 500 }
    );
  }
}
