import { NextRequest, NextResponse } from 'next/server';
import { getSurveyById } from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { logger } from '@/lib/utils/logger';
import {
  groupSubscribersBySource,
  RawSubscriberRecord,
} from '@/lib/utils/subscriberSource';

const EMAIL_SUBSCRIBERS_COLLECTION = 'emailSubscribers';

/**
 * GET /api/surveys/[id]/subscribers
 * Get all email subscribers for a survey's questions (deduplicated)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;

    // Extract and verify token
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Verify user owns this survey
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    if (survey.creatorId !== userId) {
      return NextResponse.json({ error: 'You can only view subscribers for your own surveys' }, { status: 403 });
    }

    const questionIds = survey.questionIds || [];
    // Also check the surveyId itself in case subscriptions were written against it
    const statementIds = Array.from(new Set([...questionIds, surveyId]));

    if (statementIds.length === 0) {
      return NextResponse.json({
        emails: [],
        count: 0,
        activeEmails: [],
        activeCount: 0,
        closedEmails: [],
        closedCount: 0,
      });
    }

    const db = getFirestoreAdmin();
    const records: RawSubscriberRecord[] = [];

    // Firestore 'in' queries are limited to 30 items, so batch them
    const BATCH_SIZE = 30;
    for (let i = 0; i < statementIds.length; i += BATCH_SIZE) {
      const batch = statementIds.slice(i, i + BATCH_SIZE);

      const snapshot = await db
        .collection(EMAIL_SUBSCRIBERS_COLLECTION)
        .where('statementId', 'in', batch)
        .where('isActive', '==', true)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        records.push({ email: data.email, source: data.source });
      }
    }

    const grouped = groupSubscribersBySource(records);

    logger.info(
      '[GET /api/surveys/[id]/subscribers] Found',
      grouped.activeCount,
      'active +',
      grouped.closedCount,
      'post-close subscribers for survey:',
      surveyId
    );

    return NextResponse.json({
      // Back-compat fields (combined)
      emails: grouped.allEmails,
      count: grouped.allEmails.length,
      // New split fields
      activeEmails: grouped.activeEmails,
      activeCount: grouped.activeCount,
      closedEmails: grouped.closedEmails,
      closedCount: grouped.closedCount,
    });
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/subscribers] Error:', error);

    return NextResponse.json(
      { error: 'Failed to fetch subscribers' },
      { status: 500 }
    );
  }
}
