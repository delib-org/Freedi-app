import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, StatementType, Statement, DEMOGRAPHIC_CONSTANTS } from '@freedi/shared-types';
import { StatementWithParagraphs, Paragraph } from '@/types';
import { HeatMapData, SegmentMetadata, DemographicHeatMapData } from '@/types/heatMap';
import { logger } from '@/lib/utils/logger';

const PARAGRAPH_VIEWS_COLLECTION = 'paragraphViews';

interface ApprovalDoc {
  paragraphId?: string;
  statementId?: string;
  approval: boolean;
  odlUserId?: string;
  odluserId?: string;
  userId?: string;
}

interface ParagraphViewDoc {
  paragraphId: string;
  visitorId: string;
  documentId: string;
}

interface UserDataDoc {
  userQuestionId: string;
  odlUserId: string;
  answer?: string;
  answerOptions?: string[];
}

interface DemographicQuestionDoc {
  userQuestionId: string;
  question: string;
  options?: Array<{ option: string }>;
}

/**
 * Get users who belong to a specific demographic segment
 * Returns null if no filter should be applied
 */
async function getUsersInSegment(
  db: FirebaseFirestore.Firestore,
  topParentId: string,
  questionId: string,
  segmentValue: string
): Promise<{ userIds: Set<string>; count: number } | null> {
  try {
    // Query usersData collection for this question
    const answersSnapshot = await db
      .collection(Collections.usersData)
      .where('userQuestionId', '==', questionId)
      .get();

    const userIds = new Set<string>();

    answersSnapshot.docs.forEach((doc) => {
      const data = doc.data() as UserDataDoc;

      // Check for match in answer or answerOptions
      const matchesAnswer = data.answer === segmentValue;
      const matchesOptions = data.answerOptions?.includes(segmentValue);

      if (matchesAnswer || matchesOptions) {
        userIds.add(data.odlUserId);
      }
    });

    // In development, allow any segment size; in production, enforce k-anonymity (5+ users)
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev && userIds.size < DEMOGRAPHIC_CONSTANTS.MIN_SEGMENT_SIZE) {
      return null;
    }

    return { userIds, count: userIds.size };
  } catch (error) {
    logger.error('[HeatMap API] Error getting users in segment:', error);

    return null;
  }
}

/**
 * Get demographic question metadata for segment info
 */
async function getQuestionMetadata(
  db: FirebaseFirestore.Firestore,
  questionId: string
): Promise<{ question: string; options: Array<{ option: string }> } | null> {
  try {
    const questionDoc = await db
      .collection(Collections.userDemographicQuestions)
      .doc(questionId)
      .get();

    if (!questionDoc.exists) {
      return null;
    }

    const data = questionDoc.data() as DemographicQuestionDoc;

    return {
      question: data.question,
      options: data.options || [],
    };
  } catch (error) {
    logger.error('[HeatMap API] Error getting question metadata:', error);

    return null;
  }
}

/**
 * GET /api/heatmap/[docId]
 * Get aggregated heat map data for a document
 * Returns approval rates, comment counts, ratings, and viewership for all paragraphs
 *
 * Query params (admin-only features):
 * - demographic: questionId to filter by
 * - segment: segmentValue to filter by
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;

    // Parse demographic filter params (admin-only feature)
    const demographicQuestionId = request.nextUrl.searchParams.get('demographic');
    const segmentValue = request.nextUrl.searchParams.get('segment');
    const hasDemographicFilter = demographicQuestionId && segmentValue;

    const db = getFirestoreAdmin();

    // Get users in segment if demographic filter is applied
    let segmentUsers: Set<string> | null = null;
    let segmentMetadata: SegmentMetadata | null = null;

    if (hasDemographicFilter) {
      const segmentResult = await getUsersInSegment(
        db,
        docId,
        demographicQuestionId,
        segmentValue
      );

      if (!segmentResult) {
        // Segment doesn't meet k-anonymity threshold or doesn't exist
        return NextResponse.json({
          error: 'Segment has fewer than 5 respondents (privacy threshold)',
          code: 'SEGMENT_TOO_SMALL',
        }, { status: 400 });
      }

      segmentUsers = segmentResult.userIds;

      // Get question metadata for response
      const questionMeta = await getQuestionMetadata(db, demographicQuestionId);

      if (questionMeta) {
        const optionLabel = questionMeta.options.find(
          (opt) => opt.option === segmentValue
        )?.option || segmentValue;

        segmentMetadata = {
          questionId: demographicQuestionId,
          questionLabel: questionMeta.question,
          segmentValue,
          segmentLabel: optionLabel,
          respondentCount: segmentResult.count,
        };
      }
    }

    // 1. Get the document with embedded paragraphs
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

    const document = docSnapshot.data() as StatementWithParagraphs;
    const paragraphs: Paragraph[] = document.paragraphs || [];
    const paragraphIds = paragraphs.map((p) => p.paragraphId);

    if (paragraphIds.length === 0) {
      return NextResponse.json({
        data: {
          approval: {},
          comments: {},
          rating: {},
          viewership: {},
        },
      });
    }

    // 2. Get all approvals for the document
    const approvalsSnapshot = await db
      .collection(Collections.approval)
      .where('documentId', '==', docId)
      .get();

    // 3. Get all comments (statements with parentId in paragraphIds)
    const commentsSnapshot = await db
      .collection(Collections.statements)
      .where('topParentId', '==', docId)
      .where('statementType', '==', StatementType.statement)
      .get();

    // 4. Get all evaluations (for rating)
    const evaluationsSnapshot = await db
      .collection(Collections.evaluations)
      .where('documentId', '==', docId)
      .get();

    // 5. Get all views
    const viewsSnapshot = await db
      .collection(PARAGRAPH_VIEWS_COLLECTION)
      .where('documentId', '==', docId)
      .get();

    // 6. Get total unique visitors for viewership percentage
    const totalVisitors = new Set(
      viewsSnapshot.docs.map((doc) => (doc.data() as ParagraphViewDoc).visitorId)
    ).size;

    // Process data into HeatMapData format
    const heatMapData: HeatMapData = {
      approval: {},
      comments: {},
      rating: {},
      viewership: {},
    };

    // Initialize all paragraphs with defaults
    paragraphIds.forEach((id) => {
      heatMapData.approval[id] = 0;
      heatMapData.comments[id] = 0;
      heatMapData.rating[id] = 0;
      heatMapData.viewership[id] = 0;
    });

    // Calculate approval score per paragraph (-1 to 1 scale)
    // -1 = all rejected, 0 = neutral/mixed, 1 = all approved
    const approvalsByParagraph: Record<string, { approved: number; rejected: number }> = {};
    approvalsSnapshot.docs.forEach((doc) => {
      const approval = doc.data() as ApprovalDoc;
      const paragraphId = approval.paragraphId || approval.statementId;
      const userId = approval.odlUserId || approval.odluserId || approval.userId;

      // Skip if filtering by segment and user not in segment
      if (segmentUsers && userId && !segmentUsers.has(userId)) {
        return;
      }

      if (paragraphId && paragraphIds.includes(paragraphId)) {
        if (!approvalsByParagraph[paragraphId]) {
          approvalsByParagraph[paragraphId] = { approved: 0, rejected: 0 };
        }
        if (approval.approval) {
          approvalsByParagraph[paragraphId].approved++;
        } else {
          approvalsByParagraph[paragraphId].rejected++;
        }
      }
    });

    // Convert to -1 to 1 scale: (approved - rejected) / total
    Object.entries(approvalsByParagraph).forEach(([id, data]) => {
      const total = data.approved + data.rejected;
      heatMapData.approval[id] = total > 0
        ? Math.round(((data.approved - data.rejected) / total) * 100) / 100
        : 0;
    });

    // Count comments per paragraph
    commentsSnapshot.docs.forEach((doc) => {
      const comment = doc.data() as Statement;
      const creatorId = comment.creatorId;

      // Skip if filtering by segment and creator not in segment
      if (segmentUsers && creatorId && !segmentUsers.has(creatorId)) {
        return;
      }

      if (!comment.hide && paragraphIds.includes(comment.parentId)) {
        heatMapData.comments[comment.parentId] =
          (heatMapData.comments[comment.parentId] || 0) + 1;
      }
    });

    // Calculate average ratings per comment (using evaluations on comments)
    const ratingsByParagraph: Record<string, { sum: number; count: number }> = {};

    // First, map comments to their parent paragraphs
    const commentToParagraph: Record<string, string> = {};
    commentsSnapshot.docs.forEach((doc) => {
      const comment = doc.data() as Statement;
      if (!comment.hide && paragraphIds.includes(comment.parentId)) {
        commentToParagraph[comment.statementId] = comment.parentId;
      }
    });

    // Then aggregate evaluations
    evaluationsSnapshot.docs.forEach((doc) => {
      const evaluation = doc.data();
      const evaluatorId = evaluation.odlUserId || evaluation.odluserId || evaluation.evaluatorId;

      // Skip if filtering by segment and evaluator not in segment
      if (segmentUsers && evaluatorId && !segmentUsers.has(evaluatorId)) {
        return;
      }

      const paragraphId = commentToParagraph[evaluation.statementId];

      if (paragraphId && typeof evaluation.evaluation === 'number') {
        if (!ratingsByParagraph[paragraphId]) {
          ratingsByParagraph[paragraphId] = { sum: 0, count: 0 };
        }
        // Evaluations are typically -1 to 1, convert to 0-5 scale
        const normalizedRating = ((evaluation.evaluation + 1) / 2) * 5;
        ratingsByParagraph[paragraphId].sum += normalizedRating;
        ratingsByParagraph[paragraphId].count++;
      }
    });

    // Convert to averages
    Object.entries(ratingsByParagraph).forEach(([id, data]) => {
      heatMapData.rating[id] = data.count > 0
        ? Math.round((data.sum / data.count) * 10) / 10
        : 0;
    });

    // Calculate viewership percentages
    const viewsByParagraph: Record<string, Set<string>> = {};
    const filteredVisitors = new Set<string>();

    viewsSnapshot.docs.forEach((doc) => {
      const view = doc.data() as ParagraphViewDoc;
      const visitorId = view.visitorId;

      // Skip if filtering by segment and visitor not in segment
      if (segmentUsers && visitorId && !segmentUsers.has(visitorId)) {
        return;
      }

      filteredVisitors.add(visitorId);

      if (paragraphIds.includes(view.paragraphId)) {
        if (!viewsByParagraph[view.paragraphId]) {
          viewsByParagraph[view.paragraphId] = new Set();
        }
        viewsByParagraph[view.paragraphId].add(view.visitorId);
      }
    });

    // Use filtered visitor count when filtering by segment
    const effectiveTotalVisitors = segmentUsers ? filteredVisitors.size : totalVisitors;

    // Convert to percentages (of total visitors to document)
    Object.entries(viewsByParagraph).forEach(([id, visitors]) => {
      heatMapData.viewership[id] = effectiveTotalVisitors > 0
        ? Math.round((visitors.size / effectiveTotalVisitors) * 100)
        : 0;
    });

    const filterInfo = segmentMetadata
      ? ` (filtered by ${segmentMetadata.questionLabel}: ${segmentMetadata.segmentLabel}, ${segmentMetadata.respondentCount} users)`
      : '';
    console.info(`[HeatMap API] Generated heat map data for ${docId}: ${paragraphIds.length} paragraphs${filterInfo}`);

    // Return data with segment metadata if filtered
    const response: DemographicHeatMapData = {
      ...heatMapData,
      segment: segmentMetadata,
    };

    return NextResponse.json({ data: response });
  } catch (error) {
    logger.error('[HeatMap API] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
