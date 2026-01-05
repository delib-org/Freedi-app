/**
 * API endpoint for creating paragraphs
 * POST /api/admin/paragraphs - Create new paragraph
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Collections, ParagraphType } from '@freedi/shared-types';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Paragraph } from '@/types';
import { logger } from '@/lib/utils/logger';

interface CreateRequest {
  documentId: string;
  content: string;
  type: ParagraphType;
  order?: number;
  imageUrl?: string;
  imageAlt?: string;
  imageCaption?: string;
  listType?: 'ul' | 'ol';
}

interface CreateResponse {
  success: boolean;
  paragraph?: Paragraph;
  error?: string;
}

/**
 * Generate a unique paragraph ID
 */
function generateParagraphId(): string {
  return `p_${crypto.randomUUID().slice(0, 8)}`;
}

export async function POST(request: NextRequest): Promise<NextResponse<CreateResponse>> {
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
    const body = await request.json() as CreateRequest;
    const { documentId, content, type, order, imageUrl, imageAlt, imageCaption, listType } = body;

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID is required' },
        { status: 400 }
      );
    }

    if (!type) {
      return NextResponse.json(
        { success: false, error: 'Paragraph type is required' },
        { status: 400 }
      );
    }

    // For non-image types, content is required
    if (type !== ParagraphType.image && !content) {
      return NextResponse.json(
        { success: false, error: 'Content is required' },
        { status: 400 }
      );
    }

    // For image type, imageUrl is required
    if (type === ParagraphType.image && !imageUrl) {
      return NextResponse.json(
        { success: false, error: 'Image URL is required for image paragraphs' },
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

    // Create new paragraph
    const newParagraph: Paragraph = {
      paragraphId: generateParagraphId(),
      type,
      content: content || '',
      order: order !== undefined ? order : paragraphs.length,
    };

    // Add optional fields
    if (imageUrl) {
      newParagraph.imageUrl = imageUrl;
    }
    if (imageAlt) {
      newParagraph.imageAlt = imageAlt;
    }
    if (imageCaption) {
      newParagraph.imageCaption = imageCaption;
    }
    if (listType) {
      newParagraph.listType = listType;
    }

    // If order is specified and is in the middle, reorder existing paragraphs
    if (order !== undefined && order < paragraphs.length) {
      // Shift paragraphs at and after the specified order
      paragraphs.forEach((p, i) => {
        if (p.order >= order) {
          paragraphs[i] = { ...p, order: p.order + 1 };
        }
      });
    }

    // Add new paragraph
    paragraphs.push(newParagraph);

    // Sort by order
    paragraphs.sort((a, b) => a.order - b.order);

    // Save to Firestore
    await docRef.update({
      paragraphs,
      lastUpdate: Date.now(),
    });

    logger.info(`Paragraph created: ${newParagraph.paragraphId} in document ${documentId}`);

    return NextResponse.json({ success: true, paragraph: newParagraph });
  } catch (error) {
    logger.error('Error creating paragraph:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to create paragraph' },
      { status: 500 }
    );
  }
}
