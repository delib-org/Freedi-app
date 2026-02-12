import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import {
  Collections,
  createParagraphStatement,
  Paragraph,
  ParagraphType,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

interface AddParagraphInput {
  documentId: string;
  content: string;
  type: ParagraphType;
}

/**
 * POST /api/admin/paragraphs
 * Create a new paragraph as a Statement object
 */
export async function POST(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const body: AddParagraphInput = await request.json();
    const { documentId, content, type } = body;

    if (!documentId || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getFirestoreAdmin();

    // Get document to verify it exists and get creator info
    const docRef = db.collection(Collections.statements).doc(documentId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Count existing paragraphs to determine order
    const paragraphsSnapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', documentId)
      .where('doc.isOfficialParagraph', '==', true)
      .get();

    const newOrder = paragraphsSnapshot.size;

    // Create creator object (use document owner info if available)
    const docData = docSnap.data();
    const creator = {
      uid: userId,
      displayName: docData?.creator?.displayName || 'Admin',
      email: docData?.creator?.email || '',
      photoURL: docData?.creator?.photoURL || '',
      isAnonymous: false,
    };

    // Create paragraph object
    const paragraph: Paragraph = {
      paragraphId: `para_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      content,
      type: type || ParagraphType.paragraph,
      order: newOrder,
    };

    // Create the paragraph as a Statement object
    const paragraphStatement = createParagraphStatement(
      paragraph,
      documentId,
      creator
    );

    if (!paragraphStatement) {
      return NextResponse.json({ error: 'Failed to create paragraph statement' }, { status: 500 });
    }

    // Save to Firestore
    await db.collection(Collections.statements).doc(paragraphStatement.statementId).set(paragraphStatement);

    logger.info(`[Paragraphs API] Created paragraph statement: ${paragraphStatement.statementId}`, {
      documentId,
      type,
      order: newOrder,
    });

    // Return in legacy Paragraph format for admin panel compatibility
    const legacyParagraph: Paragraph = {
      paragraphId: paragraphStatement.statementId,
      content: content,
      type: type,
      order: newOrder,
    };

    return NextResponse.json({ success: true, paragraph: legacyParagraph });
  } catch (error) {
    logger.error('[Paragraphs API] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
