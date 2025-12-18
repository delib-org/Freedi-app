import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, DEMOGRAPHIC_CONSTANTS } from '@freedi/shared-types';
import { DemographicFilterOption } from '@/types/heatMap';
import { logger } from '@/lib/utils/logger';

interface DemographicQuestionDoc {
  userQuestionId: string;
  question: string;
  type: string;
  options?: Array<{ option: string; color?: string }>;
  scope: string;
  statementId?: string;
  topParentId?: string;
}

interface UserDataDoc {
  userQuestionId: string;
  odlUserId: string;
  answer?: string;
  answerOptions?: string[];
}

/**
 * GET /api/heatmap/[docId]/demographics
 * Get available demographic questions and their options for filtering
 * Only returns options that meet the k-anonymity threshold (5+ users)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;
    const db = getFirestoreAdmin();

    // 1. Get the document to find topParentId
    const docSnapshot = await db
      .collection(Collections.statements)
      .doc(docId)
      .get();

    if (!docSnapshot.exists) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const document = docSnapshot.data();
    const topParentId = document?.topParentId || docId;

    // 2. Get demographic questions (group-level and statement-level)
    // Note: Questions created in main app might not have scope field, so we query by statementId for all statement-level
    const questionsRef = db.collection(Collections.userDemographicQuestions);

    const [groupSnapshot, statementSnapshot] = await Promise.all([
      // Group-level questions: have topParentId and scope='group'
      questionsRef
        .where('topParentId', '==', topParentId)
        .where('scope', '==', 'group')
        .get(),
      // Statement-level questions: have statementId matching docId (may or may not have scope)
      questionsRef
        .where('statementId', '==', docId)
        .get(),
    ]);

    // Filter out group-scoped questions from statement query (they were already captured)
    const statementQuestions = statementSnapshot.docs
      .map((doc) => doc.data() as DemographicQuestionDoc)
      .filter((q) => q.scope !== 'group');

    const allQuestions: DemographicQuestionDoc[] = [
      ...groupSnapshot.docs.map((doc) => doc.data() as DemographicQuestionDoc),
      ...statementQuestions,
    ];

    // Debug logging
    console.info(`[HeatMap Demographics API] Document ${docId}, topParentId: ${topParentId}`);
    console.info(`[HeatMap Demographics API] Found questions - group: ${groupSnapshot.docs.length}, statement: ${statementSnapshot.docs.length} (filtered to ${statementQuestions.length})`);
    console.info(`[HeatMap Demographics API] Total questions: ${allQuestions.length}`);

    // Only use questions with options (radio/checkbox types)
    const questionsWithOptions = allQuestions.filter(
      (q) => q.options && q.options.length > 0 && (q.type === 'radio' || q.type === 'checkbox')
    );

    console.info(`[HeatMap Demographics API] Questions with options (radio/checkbox): ${questionsWithOptions.length}`);
    if (allQuestions.length > 0) {
      console.info(`[HeatMap Demographics API] Sample question types: ${allQuestions.map(q => q.type).join(', ')}`);
    }

    if (questionsWithOptions.length === 0) {
      return NextResponse.json({ demographics: [] });
    }

    // 3. Get all user answers to count respondents per option
    const questionIds = questionsWithOptions.map((q) => q.userQuestionId);

    // Query all answers for these questions
    const answersPromises = questionIds.map((qId) =>
      db
        .collection(Collections.usersData)
        .where('userQuestionId', '==', qId)
        .get()
    );

    const answersSnapshots = await Promise.all(answersPromises);

    // Build count map: questionId -> optionValue -> count
    const countMap: Record<string, Record<string, number>> = {};

    questionIds.forEach((qId, index) => {
      countMap[qId] = {};
      answersSnapshots[index].docs.forEach((doc) => {
        const data = doc.data() as UserDataDoc;

        // Handle single answer
        if (data.answer) {
          countMap[qId][data.answer] = (countMap[qId][data.answer] || 0) + 1;
        }

        // Handle multiple answers (checkbox)
        if (data.answerOptions) {
          data.answerOptions.forEach((opt) => {
            countMap[qId][opt] = (countMap[qId][opt] || 0) + 1;
          });
        }
      });
    });

    // 4. Build response with only options meeting k-anonymity threshold
    // In development, show all segments; in production, enforce k-anonymity
    const isDev = process.env.NODE_ENV === 'development';
    const minSegmentSize = isDev ? 0 : DEMOGRAPHIC_CONSTANTS.MIN_SEGMENT_SIZE;
    const demographics: DemographicFilterOption[] = [];

    questionsWithOptions.forEach((q) => {
      const optionsWithCounts = (q.options || [])
        .map((opt) => ({
          value: opt.option,
          label: opt.option,
          count: countMap[q.userQuestionId]?.[opt.option] || 0,
        }))
        .filter((opt) => opt.count >= minSegmentSize);

      // Only include question if it has at least one valid option
      if (optionsWithCounts.length > 0) {
        demographics.push({
          questionId: q.userQuestionId,
          question: q.question,
          options: optionsWithCounts,
        });
      }
    });

    console.info(
      `[HeatMap Demographics API] Found ${demographics.length} filterable demographics for ${docId}`
    );

    return NextResponse.json({ demographics });
  } catch (error) {
    logger.error('[HeatMap Demographics API] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
