import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { logger } from '@/lib/utils/logger';

const COLLECTION_NAME = 'paragraphViews';

interface ViewInput {
  documentId: string;
  visitorId: string;
  duration: number;
}

/**
 * GET /api/views/[paragraphId]
 * Get view count for a paragraph
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    const { paragraphId } = await params;

    const db = getFirestoreAdmin();
    const snapshot = await db
      .collection(COLLECTION_NAME)
      .where('paragraphId', '==', paragraphId)
      .count()
      .get();

    const count = snapshot.data().count;

    return NextResponse.json({ count });
  } catch (error) {
    logger.error('[Views API] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/views/[paragraphId]
 * Record a paragraph view (5+ seconds)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    const { paragraphId } = await params;
    const body: ViewInput = await request.json();
    const { documentId, visitorId, duration } = body;

    // Validate required fields
    if (!documentId) {
      return NextResponse.json(
        { error: 'documentId is required' },
        { status: 400 }
      );
    }

    if (!visitorId) {
      return NextResponse.json(
        { error: 'visitorId is required' },
        { status: 400 }
      );
    }

    if (typeof duration !== 'number' || duration < 5) {
      return NextResponse.json(
        { error: 'duration must be at least 5 seconds' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // Use composite key to prevent duplicate views from same visitor
    const viewId = `${visitorId}--${paragraphId}`;

    // Check if view already exists
    const existingView = await db.collection(COLLECTION_NAME).doc(viewId).get();

    if (existingView.exists) {
      // Update duration if longer
      const existingData = existingView.data();
      if (existingData && duration > existingData.duration) {
        await db.collection(COLLECTION_NAME).doc(viewId).update({
          duration,
          lastViewedAt: Date.now(),
        });
      }

      return NextResponse.json({ success: true, updated: true });
    }

    // Create new view record
    const viewData = {
      viewId,
      paragraphId,
      visitorId,
      documentId,
      viewedAt: Date.now(),
      duration,
    };

    await db.collection(COLLECTION_NAME).doc(viewId).set(viewData);

    console.info(`[Views API] Recorded view: ${viewId} (${duration}s)`);

    return NextResponse.json({ success: true, view: viewData });
  } catch (error) {
    logger.error('[Views API] POST error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
