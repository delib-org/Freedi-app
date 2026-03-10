import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie } from '@/lib/utils/user';
import { Collections, Role } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

interface MarkVisitedBody {
  statementId: string;
}

/**
 * POST /api/documents/mark-visited
 * When a user views a document in the Sign app, create/update their subscription
 * with isDocument: true so it appears on their home page.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Skip anonymous users - they don't have a home page
    if (userId.startsWith('anon_')) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const body = (await request.json()) as MarkVisitedBody;

    if (!body.statementId) {
      return NextResponse.json(
        { error: 'statementId is required' },
        { status: 400 }
      );
    }

    const { db } = getFirebaseAdmin();
    const { statementId } = body;
    const subscriptionId = `${userId}--${statementId}`;
    const now = Date.now();

    const subRef = db.collection(Collections.statementsSubscribe).doc(subscriptionId);
    const subSnap = await subRef.get();

    // Fetch the statement (needed for new subscriptions and to set isDocument flag)
    const statementRef = db.collection(Collections.statements).doc(statementId);
    const statementDoc = await statementRef.get();

    if (!statementDoc.exists) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const statementData = statementDoc.data();

    // Mark the statement itself as a Sign document (if not already)
    if (statementData && !statementData.isDocument) {
      await statementRef.update({ isDocument: true });
    }

    if (subSnap.exists) {
      // Subscription exists - just set isDocument flag
      await subRef.update({ isDocument: true, lastUpdate: now });
    } else {
      const displayName = getUserDisplayNameFromCookie(cookieHeader) || 'Anonymous';

      await subRef.set({
        role: Role.member,
        userId,
        statementId,
        lastUpdate: now,
        createdAt: now,
        statementsSubscribeId: subscriptionId,
        isDocument: true,
        statement: statementData,
        user: {
          displayName,
          uid: userId,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError(error, { operation: 'api.documents.markVisited' });

    return NextResponse.json(
      { error: 'Failed to mark document' },
      { status: 500 }
    );
  }
}
