/**
 * API endpoint for reordering paragraphs
 * POST /api/admin/paragraphs/reorder
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Collections } from '@freedi/shared-types';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Paragraph } from '@/types';
import { logger } from '@/lib/utils/logger';

interface ReorderRequest {
  documentId: string;
  orderedParagraphIds: string[];
}

interface ReorderResponse {
  success: boolean;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ReorderResponse>> {
  try {
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
    const body = await request.json() as ReorderRequest;
    const { documentId, orderedParagraphIds } = body;

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID is required' },
        { status: 400 }
      );
    }

    if (!orderedParagraphIds || !Array.isArray(orderedParagraphIds)) {
      return NextResponse.json(
        { success: false, error: 'Ordered paragraph IDs array is required' },
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

    // Check admin access
    const accessResult = await checkAdminAccess(db, documentId, userId);

    if (!accessResult.isAdmin || accessResult.isViewer) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to modify this document' },
        { status: 403 }
      );
    }

    const docData = docSnap.data();
    const paragraphs: Paragraph[] = docData?.paragraphs || [];

    // Create a map for quick lookup
    const paragraphMap = new Map<string, Paragraph>();
    paragraphs.forEach(p => paragraphMap.set(p.paragraphId, p));

    // Validate all IDs exist
    for (const id of orderedParagraphIds) {
      if (!paragraphMap.has(id)) {
        return NextResponse.json(
          { success: false, error: `Paragraph ${id} not found` },
          { status: 400 }
        );
      }
    }

    // Check if all paragraphs are included
    if (orderedParagraphIds.length !== paragraphs.length) {
      return NextResponse.json(
        { success: false, error: 'All paragraphs must be included in the ordered list' },
        { status: 400 }
      );
    }

    // Reorder paragraphs
    const reorderedParagraphs: Paragraph[] = orderedParagraphIds.map((id, index) => ({
      ...paragraphMap.get(id)!,
      order: index,
    }));

    // Save to Firestore
    await docRef.update({
      paragraphs: reorderedParagraphs,
      lastUpdate: Date.now(),
    });

    logger.info(`Paragraphs reordered in document ${documentId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error reordering paragraphs:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to reorder paragraphs' },
      { status: 500 }
    );
  }
}
