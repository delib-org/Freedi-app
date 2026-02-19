import { NextRequest, NextResponse } from 'next/server';
import { getSurveyById } from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { logger } from '@/lib/utils/logger';

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
    if (questionIds.length === 0) {
      return NextResponse.json({ emails: [], count: 0 });
    }

    const db = getFirestoreAdmin();
    const emailSet = new Set<string>();

    // Firestore 'in' queries are limited to 30 items, so batch them
    const BATCH_SIZE = 30;
    for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
      const batch = questionIds.slice(i, i + BATCH_SIZE);

      const snapshot = await db
        .collection(EMAIL_SUBSCRIBERS_COLLECTION)
        .where('statementId', 'in', batch)
        .where('isActive', '==', true)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.email && typeof data.email === 'string') {
          emailSet.add(data.email.toLowerCase());
        }
      }
    }

    const emails = Array.from(emailSet).sort();

    logger.info('[GET /api/surveys/[id]/subscribers] Found', emails.length, 'unique subscribers for survey:', surveyId);

    return NextResponse.json({ emails, count: emails.length });
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/subscribers] Error:', error);

    return NextResponse.json(
      { error: 'Failed to fetch subscribers' },
      { status: 500 }
    );
  }
}
