import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections, Paragraph, ParagraphType } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

interface UpdateParagraphInput {
  documentId: string;
  content: string;
  type: ParagraphType;
}

/**
 * PATCH /api/admin/paragraphs/[paragraphId]
 * Update an existing paragraph statement
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    const { paragraphId } = await params;
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const body: UpdateParagraphInput = await request.json();
    const { documentId, content, type } = body;

    if (!documentId || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getFirestoreAdmin();

    // Verify paragraph exists
    const paragraphRef = db.collection(Collections.statements).doc(paragraphId);
    const paragraphSnap = await paragraphRef.get();

    if (!paragraphSnap.exists) {
      return NextResponse.json({ error: 'Paragraph not found' }, { status: 404 });
    }

    // Update the paragraph statement
    await paragraphRef.update({
      statement: content,
      'doc.type': type,
      lastUpdate: Date.now(),
    });

    logger.info(`[Paragraphs API] Updated paragraph statement: ${paragraphId}`);

    // Get updated data for response
    const updated = await paragraphRef.get();
    const data = updated.data();

    // Return in legacy Paragraph format for admin panel compatibility
    const legacyParagraph: Paragraph = {
      paragraphId: paragraphId,
      content: content,
      type: type,
      order: data?.doc?.order || 0,
    };

    return NextResponse.json({ success: true, paragraph: legacyParagraph });
  } catch (error) {
    logger.error('[Paragraphs API] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
