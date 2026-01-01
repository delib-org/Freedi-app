import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Statement } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';

/**
 * GET /api/statements/[id] - Get a single statement by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

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

/**
 * PATCH /api/statements/[id] - Update a statement (admin only)
 * Currently supports updating the statement text
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

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

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { statement: newStatementText } = body;

    if (!newStatementText || typeof newStatementText !== 'string') {
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

    // Update the statement
    await docRef.update({
      statement: newStatementText.trim(),
      lastUpdate: Date.now(),
    });

    logger.info('[PATCH /api/statements/[id]] Statement updated:', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[PATCH /api/statements/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update statement' },
      { status: 500 }
    );
  }
}
