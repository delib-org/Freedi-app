import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Statement } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

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
