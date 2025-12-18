import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { logError } from '@/lib/utils/errorHandling';
import { logger } from '@/lib/utils/logger';

// Use the same collection as the Firebase function for admin notifications
const EMAIL_SUBSCRIBERS_COLLECTION = 'emailSubscribers';

interface EmailSubscriber {
  subscriberId: string;
  email: string;
  statementId: string;
  userId?: string;
  createdAt: number;
  isActive: boolean;
  source: string;
}

/**
 * POST /api/statements/[id]/subscribe
 * Subscribe to receive email notifications for a statement
 * Works with the admin email notification system in the main app
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: statementId } = await params;
    const body = await request.json();
    const { email, userId } = body;

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
      .collection(EMAIL_SUBSCRIBERS_COLLECTION)
      .where('email', '==', email.toLowerCase())
      .where('statementId', '==', statementId)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      // Already subscribed, return success anyway
      return NextResponse.json({
        success: true,
        message: 'Already subscribed',
        alreadySubscribed: true,
        subscriberId: existingQuery.docs[0].id,
      });
    }

    // Create subscription ID matching the format in Firebase function
    const subscriberId = `${statementId}--${email.toLowerCase().replace(/[^a-z0-9]/g, '_')}--${Date.now()}`;

    const subscription: EmailSubscriber = {
      subscriberId,
      email: email.toLowerCase(),
      statementId,
      userId: userId || undefined,
      createdAt: Date.now(),
      isActive: true,
      source: 'mass-consensus',
    };

    await db.collection(EMAIL_SUBSCRIBERS_COLLECTION).doc(subscriberId).set(subscription);

    logger.info('Email subscriber added from mass-consensus', {
      subscriberId,
      statementId,
    });

    return NextResponse.json({
      success: true,
      message: 'Subscribed successfully',
      subscriberId,
    });
  } catch (error) {
    const { id: questionId } = await params;

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: statementId } = await params;
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    const existingQuery = await db
      .collection(EMAIL_SUBSCRIBERS_COLLECTION)
      .where('email', '==', email.toLowerCase())
      .where('statementId', '==', statementId)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    return NextResponse.json({
      subscribed: !existingQuery.empty,
    });
  } catch (error) {
    const { id: questionId } = await params;

    logError(error, {
      operation: 'api.subscribe.check',
      metadata: { questionId },
    });

    return NextResponse.json(
      { error: 'Failed to check subscription' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/statements/[id]/subscribe
 * Unsubscribe from email notifications
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: statementId } = await params;
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const subscriberId = searchParams.get('subscriberId');

    const db = getFirestoreAdmin();

    if (subscriberId) {
      // Unsubscribe by subscriber ID
      await db.collection(EMAIL_SUBSCRIBERS_COLLECTION).doc(subscriberId).update({
        isActive: false,
      });
    } else if (email) {
      // Unsubscribe by email and statement
      const subscribersSnapshot = await db
        .collection(EMAIL_SUBSCRIBERS_COLLECTION)
        .where('email', '==', email.toLowerCase())
        .where('statementId', '==', statementId)
        .get();

      const batch = db.batch();
      subscribersSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { isActive: false });
      });
      await batch.commit();
    } else {
      return NextResponse.json(
        { error: 'Either email or subscriberId is required' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Unsubscribed successfully',
    });
  } catch (error) {
    const { id: questionId } = await params;

    logError(error, {
      operation: 'api.unsubscribe',
      metadata: { questionId },
    });

    return NextResponse.json(
      { error: 'Failed to unsubscribe' },
      { status: 500 }
    );
  }
}
