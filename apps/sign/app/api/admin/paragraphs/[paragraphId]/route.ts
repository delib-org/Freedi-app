import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Collections, Paragraph, ParagraphType, Statement, StatementType } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/admin/paragraphs/[documentId]
 * Get all paragraphs for a document (for version control page)
 * Note: The param is named paragraphId but for GET it's used as documentId
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    // For GET, we treat the param as documentId
    const { paragraphId: documentId } = await params;
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const db = getFirestoreAdmin();

    // Verify user has admin access to this document
    const adminAccess = await checkAdminAccess(db, documentId, userId);
    if (!adminAccess.isAdmin) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Query paragraphs for this document
    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', documentId)
      .where('statementType', '==', StatementType.option)
      .orderBy('doc.order', 'asc')
      .get();

    const paragraphs: Statement[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data() as Statement;
      // Only include official paragraphs (not suggestions)
      if (data.doc?.isOfficialParagraph && !data.hide) {
        paragraphs.push(data);
      }
    });

    return NextResponse.json({ paragraphs });
  } catch (error) {
    logger.error('[Paragraphs API] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface UpdateParagraphContentInput {
  documentId: string;
  content: string;
  type: ParagraphType;
}

interface UpdateParagraphNonInteractiveInput {
  documentId: string;
  isNonInteractive: boolean;
}

type UpdateParagraphInput = UpdateParagraphContentInput | UpdateParagraphNonInteractiveInput;

function isNonInteractiveUpdate(body: UpdateParagraphInput): body is UpdateParagraphNonInteractiveInput {
  return 'isNonInteractive' in body;
}

/**
 * PATCH /api/admin/paragraphs/[paragraphId]
 * Update an existing paragraph - supports both content updates and non-interactive toggle
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
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
    }

    const db = getFirestoreAdmin();

    // Verify user has admin access to this document
    const adminAccess = await checkAdminAccess(db, documentId, userId);
    if (!adminAccess.isAdmin) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Verify paragraph exists
    const paragraphRef = db.collection(Collections.statements).doc(paragraphId);
    const paragraphSnap = await paragraphRef.get();

    if (!paragraphSnap.exists) {
      return NextResponse.json({ error: 'Paragraph not found' }, { status: 404 });
    }

    // Handle non-interactive toggle
    if (isNonInteractiveUpdate(body)) {
      const { isNonInteractive } = body;

      await paragraphRef.update({
        'doc.isNonInteractive': isNonInteractive,
        lastUpdate: Date.now(),
      });

      logger.info(`[Paragraphs API] Updated paragraph isNonInteractive: ${paragraphId} -> ${isNonInteractive}`);

      return NextResponse.json({ success: true, isNonInteractive });
    }

    // Handle content update
    const { content, type } = body;

    if (!content) {
      return NextResponse.json({ error: 'Missing content field' }, { status: 400 });
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
