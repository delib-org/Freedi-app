import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { logError, ValidationError } from '@/lib/utils/errorHandling';

const COLLECTION_NAME = 'resultSubscriptions';

interface SubscriptionData {
  email: string;
  statementId: string;
  userId: string;
  createdAt: number;
  notified: boolean;
}

/**
 * POST /api/statements/[id]/subscribe
 * Subscribe to receive email notification when results are ready
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { email, userId } = body;
    const statementId = params.id;

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate statementId
    if (!statementId) {
      return NextResponse.json(
        { error: 'Statement ID is required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // Check if already subscribed (by email + statementId)
    const existingQuery = await db
      .collection(COLLECTION_NAME)
      .where('email', '==', email.toLowerCase())
      .where('statementId', '==', statementId)
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      // Already subscribed, return success anyway
      return NextResponse.json({
        success: true,
        message: 'Already subscribed',
        alreadySubscribed: true,
      });
    }

    // Create subscription
    const subscriptionRef = db.collection(COLLECTION_NAME).doc();
    const subscription: SubscriptionData = {
      email: email.toLowerCase(),
      statementId,
      userId: userId || 'anonymous',
      createdAt: Date.now(),
      notified: false,
    };

    await subscriptionRef.set(subscription);

    return NextResponse.json({
      success: true,
      message: 'Subscribed successfully',
      subscriptionId: subscriptionRef.id,
    });
  } catch (error) {
    const questionId = params.id;

    logError(error, {
      operation: 'api.subscribe',
      metadata: { questionId },
    });

    return NextResponse.json(
      { error: 'Failed to subscribe' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/statements/[id]/subscribe
 * Check subscription status for a given email
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const statementId = params.id;

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    const existingQuery = await db
      .collection(COLLECTION_NAME)
      .where('email', '==', email.toLowerCase())
      .where('statementId', '==', statementId)
      .limit(1)
      .get();

    return NextResponse.json({
      subscribed: !existingQuery.empty,
    });
  } catch (error) {
    logError(error, {
      operation: 'api.subscribe.check',
      metadata: { questionId: params.id },
    });

    return NextResponse.json(
      { error: 'Failed to check subscription' },
      { status: 500 }
    );
  }
}
