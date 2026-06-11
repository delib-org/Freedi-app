import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections } from '@freedi/shared-types';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logError } from '@/lib/utils/errorHandling';

/**
 * POST /api/statements/[id]/view
 * Record that a user entered a question.
 *
 * One statementViews doc per user per question (`${userId}--${statementId}`),
 * so distinct docs == unique entrants. Repeat visits only bump the per-doc
 * view counter and lastViewed; the doc-create Cloud Function
 * (updateStatementWithViews) therefore increments the question's
 * `viewed.individualViews` exactly once per unique user.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.STANDARD);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { id: statementId } = await params;
    const body = await request.json().catch(() => ({}));
    const bodyUserId = typeof body.userId === 'string' ? body.userId : undefined;

    const cookieUserId = getUserIdFromCookie(request.headers.get('cookie'));
    const userId = bodyUserId || cookieUserId;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const db = getFirestoreAdmin();

    const statementDoc = await db
      .collection(Collections.statements)
      .doc(statementId)
      .get();

    if (!statementDoc.exists) {
      return NextResponse.json({ error: 'Statement not found' }, { status: 404 });
    }

    const viewId = `${userId}--${statementId}`;
    const viewRef = db.collection(Collections.statementViews).doc(viewId);

    await viewRef.set(
      {
        statementId,
        userId,
        viewed: FieldValue.increment(1),
        lastViewed: Date.now(),
        parentDocumentId: statementDoc.data()?.topParentId ?? statementId,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError(error, {
      operation: 'api.statements.view',
    });

    return NextResponse.json({ error: 'Failed to record view' }, { status: 500 });
  }
}
