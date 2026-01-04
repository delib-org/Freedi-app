/**
 * API endpoint for managing paragraph settings
 * PATCH /api/admin/paragraphs/[paragraphId] - Update paragraph
 * DELETE /api/admin/paragraphs/[paragraphId] - Delete paragraph
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Collections, ParagraphType } from '@freedi/shared-types';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Paragraph } from '@/types';
import { logger } from '@/lib/utils/logger';

interface PatchRequest {
  documentId: string;
  content?: string;
  type?: ParagraphType;
  order?: number;
  imageUrl?: string;
  imageAlt?: string;
  imageCaption?: string;
  isNonInteractive?: boolean;
  listType?: 'ul' | 'ol';
}

interface PatchResponse {
  success: boolean;
  paragraph?: Paragraph;
  error?: string;
}

interface DeleteRequest {
  documentId: string;
}

interface DeleteResponse {
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
    const { documentId, content, type, order, imageUrl, imageAlt, imageCaption, isNonInteractive, listType } = body;

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID is required' },
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

    // Check admin access (owner or collaborator)
    const accessResult = await checkAdminAccess(db, documentId, userId);

    if (!accessResult.isAdmin || accessResult.isViewer) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to modify this document' },
        { status: 403 }
      );
    }

    const docData = docSnap.data();

    // Get paragraphs and update the specific one
    const paragraphs: Paragraph[] = docData?.paragraphs || [];
    const paragraphIndex = paragraphs.findIndex(p => p.paragraphId === paragraphId);

    if (paragraphIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Paragraph not found' },
        { status: 404 }
      );
    }

    // Build updated paragraph
    const updatedParagraph: Paragraph = {
      ...paragraphs[paragraphIndex],
    };

    // Update fields if provided
    if (content !== undefined) {
      updatedParagraph.content = content;
    }
    if (type !== undefined) {
      updatedParagraph.type = type;
    }
    if (order !== undefined) {
      updatedParagraph.order = order;
    }
    if (imageUrl !== undefined) {
      updatedParagraph.imageUrl = imageUrl;
    }
    if (imageAlt !== undefined) {
      updatedParagraph.imageAlt = imageAlt;
    }
    if (imageCaption !== undefined) {
      updatedParagraph.imageCaption = imageCaption;
    }
    if (isNonInteractive !== undefined) {
      updatedParagraph.isNonInteractive = isNonInteractive;
    }
    if (listType !== undefined) {
      updatedParagraph.listType = listType;
    }

    paragraphs[paragraphIndex] = updatedParagraph;

    // Save to Firestore
    await docRef.update({
      paragraphs,
      lastUpdate: Date.now(),
    });

    return NextResponse.json({ success: true, paragraph: updatedParagraph });
  } catch (error) {
    logger.error('Error updating paragraph:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to update paragraph' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
): Promise<NextResponse<DeleteResponse>> {
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
    const body = await request.json() as DeleteRequest;
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID is required' },
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

    // Get paragraphs and remove the specific one
    let paragraphs: Paragraph[] = docData?.paragraphs || [];
    const paragraphIndex = paragraphs.findIndex(p => p.paragraphId === paragraphId);

    if (paragraphIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Paragraph not found' },
        { status: 404 }
      );
    }

    // Remove the paragraph
    paragraphs.splice(paragraphIndex, 1);

    // Reorder remaining paragraphs
    paragraphs = paragraphs.map((p, i) => ({ ...p, order: i }));

    // Save to Firestore
    await docRef.update({
      paragraphs,
      lastUpdate: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deleting paragraph:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to delete paragraph' },
      { status: 500 }
    );
  }
}
