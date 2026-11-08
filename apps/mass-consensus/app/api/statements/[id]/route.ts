import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { VALIDATION } from '@/constants/common';
import { logger } from '@/lib/utils/logger';
import { logError } from '@/lib/utils/errorHandling';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { canEditQuestionCards } from '@/lib/auth/questionCardsAccess';

/**
 * GET /api/statements/[id] - Get a single statement by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Statement ID is required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();
    const doc = await db.collection(Collections.statements).doc(id).get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Statement not found' },
        { status: 404 }
      );
    }

    const statement = doc.data() as Statement;

    return NextResponse.json({ statement });
  } catch (error) {
    logger.error('[GET /api/statements/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statement' },
      { status: 500 }
    );
  }
}

interface PatchBody {
  statement?: unknown;
  hide?: unknown;
}

/**
 * PATCH /api/statements/[id]?surveyId= — admin only. Body: `{ statement }`
 * to change the text, `{ hide: true }` to take an option card out of its
 * question. The caller may edit a question they administer, or an option of
 * such a question; a survey's owner and editors count as admins of the
 * survey's questions (see canEditQuestionCards).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let userId: string | null = null;

  try {
    if (!id) {
      return NextResponse.json(
        { error: 'Statement ID is required' },
        { status: 400 }
      );
    }

    // Verify authentication
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const body = (await request.json()) as PatchBody;
    const newText = typeof body.statement === 'string' ? body.statement.trim() : undefined;
    const hide = body.hide === true;

    if (newText === undefined && !hide) {
      return NextResponse.json(
        { error: 'Statement text is required' },
        { status: 400 }
      );
    }
    if (newText !== undefined && newText.length === 0) {
      return NextResponse.json(
        { error: 'Statement text is required' },
        { status: 400 }
      );
    }
    const db = getFirestoreAdmin();
    const docRef = db.collection(Collections.statements).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Statement not found' },
        { status: 404 }
      );
    }

    const statement = doc.data() as Statement;
    const isOption = statement.statementType === StatementType.option;
    // An option is managed through its question; anything else through itself
    const questionId = isOption ? statement.parentId : id;
    const surveyId = request.nextUrl.searchParams.get('surveyId');
    if (!(await canEditQuestionCards(userId, questionId, surveyId))) {
      return NextResponse.json(
        { error: 'Only an admin can edit this statement' },
        { status: 403 }
      );
    }

    if (hide && !isOption) {
      return NextResponse.json(
        { error: 'Only option cards can be hidden' },
        { status: 400 }
      );
    }
    if (isOption && newText !== undefined && newText.length > VALIDATION.MAX_STATEMENT_LENGTH) {
      return NextResponse.json(
        { error: `A card can hold at most ${VALIDATION.MAX_STATEMENT_LENGTH} characters` },
        { status: 400 }
      );
    }

    const batch = db.batch();
    batch.update(docRef, {
      ...(newText !== undefined ? { statement: newText } : {}),
      ...(hide ? { hide: true } : {}),
      lastUpdate: Date.now(),
    });
    if (hide && !statement.hide) {
      batch.update(db.collection(Collections.statements).doc(questionId), {
        numberOfOptions: FieldValue.increment(-1),
        lastUpdate: Date.now(),
      });
    }
    await batch.commit();

    logger.info('[PATCH /api/statements/[id]] Statement updated:', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, {
      operation: 'api.statements.PATCH',
      userId: userId ?? undefined,
      statementId: id,
    });

    return NextResponse.json(
      { error: 'Failed to update statement' },
      { status: 500 }
    );
  }
}
