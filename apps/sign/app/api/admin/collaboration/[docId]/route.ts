import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections, StatementType, Statement, DEMOGRAPHIC_CONSTANTS } from '@freedi/shared-types';
import { StatementWithParagraphs, Paragraph } from '@/types';
import { logger } from '@/lib/utils/logger';

// Thresholds for classification
const COLLABORATION_THRESHOLDS = {
  POLARIZED: 0.6,      // Divergence > 0.6
  COLLABORATIVE: 0.25, // Divergence < 0.25
};

const INTERNAL_AGREEMENT_THRESHOLDS = {
  HIGH: 0.2,    // MAD < 0.2
  LOW: 0.5,     // MAD > 0.5
};

interface ApprovalDoc {
  paragraphId?: string;
  statementId?: string;
  approval: boolean;
  odlUserId?: string;
  odluserId?: string;
  userId?: string;
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
  type: string;
  options?: Array<{ option: string; color?: string }>;
  scope?: string;
}

interface SegmentData {
  segmentId: string;
  segmentName: string;
  segmentValue: string;
  userCount: number;
  approvalCount: number;
  rejectionCount: number;
  approvalRate: number;
  meanApproval: number;
  mad: number;
  internalAgreement: 'high' | 'medium' | 'low';
  commentCount: number;
}

interface ParagraphCollaborationData {
  paragraphId: string;
  paragraphText: string;
  paragraphIndex: number;
  overallApproval: number;
  divergenceScore: number;
  collaborationStatus: 'polarized' | 'mixed' | 'collaborative';
  segments: SegmentData[];
  totalComments: number;
  totalApprovals: number;
  totalRejections: number;
}

interface CollaborationIndexResponse {
  documentTitle: string;
  documentId: string;
  totalParagraphs: number;
  polarizedCount: number;
  collaborativeCount: number;
  mixedCount: number;
  demographicQuestion: {
    questionId: string;
    question: string;
    options: Array<{ option: string; color?: string }>;
  } | null;
  paragraphs: ParagraphCollaborationData[];
}

/**
 * Calculate Mean Absolute Deviation
 */
function calcMAD(values: number[]): { mad: number; mean: number } {
  if (values.length === 0) return { mad: 0, mean: 0 };
  if (values.length === 1) return { mad: 0, mean: values[0] };

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const mad = values.reduce((sum, v) => sum + Math.abs(v - mean), 0) / values.length;

  return { mad, mean };
}

/**
 * Classify internal agreement based on MAD
 */
function classifyInternalAgreement(mad: number): 'high' | 'medium' | 'low' {
  if (mad < INTERNAL_AGREEMENT_THRESHOLDS.HIGH) return 'high';
  if (mad > INTERNAL_AGREEMENT_THRESHOLDS.LOW) return 'low';
  return 'medium';
}

/**
 * Classify collaboration status based on divergence score
 */
function classifyCollaborationStatus(divergence: number): 'polarized' | 'mixed' | 'collaborative' {
  if (divergence > COLLABORATION_THRESHOLDS.POLARIZED) return 'polarized';
  if (divergence < COLLABORATION_THRESHOLDS.COLLABORATIVE) return 'collaborative';
  return 'mixed';
}

/**
 * GET /api/admin/collaboration/[docId]
 * Get collaboration index data for all paragraphs in a document
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
  try {
    const { docId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { db } = getFirebaseAdmin();

    // 1. Get the document and verify admin access
    const docRef = db.collection(Collections.statements).doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const documentData = docSnap.data();
    const isAdmin = documentData?.creator?.odlUserId === userId || documentData?.creatorId === userId;

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const document = documentData as StatementWithParagraphs;
    const documentTitle = document.statement || 'Untitled Document';
    const paragraphs: Paragraph[] = (document.paragraphs || []).filter(p => !(p as Paragraph & { isNonInteractive?: boolean }).isNonInteractive);
    const paragraphIds = paragraphs.map((p) => p.paragraphId);
    const topParentId = documentData?.topParentId || docId;

    // 2. Get demographic questions (first radio/checkbox question with options)
    const questionsRef = db.collection(Collections.userDemographicQuestions);
    const [groupSnapshot, statementSnapshot] = await Promise.all([
      questionsRef
        .where('topParentId', '==', topParentId)
        .where('scope', '==', 'group')
        .get(),
      questionsRef
        .where('statementId', '==', docId)
        .get(),
    ]);

    const statementQuestions = statementSnapshot.docs
      .map((doc) => doc.data() as DemographicQuestionDoc)
      .filter((q) => q.scope !== 'group');

    const allQuestions: DemographicQuestionDoc[] = [
      ...groupSnapshot.docs.map((doc) => doc.data() as DemographicQuestionDoc),
      ...statementQuestions,
    ];

    // Get first valid demographic question
    const demographicQuestion = allQuestions.find(
      (q) => q.options && q.options.length > 0 && (q.type === 'radio' || q.type === 'checkbox')
    );

    if (!demographicQuestion) {
      return NextResponse.json({
        documentTitle,
        documentId: docId,
        totalParagraphs: paragraphs.length,
        polarizedCount: 0,
        collaborativeCount: 0,
        mixedCount: 0,
        demographicQuestion: null,
        paragraphs: [],
        message: 'No demographic questions found for this document',
      });
    }

    // 3. Build user-to-segment mapping
    const questionId = demographicQuestion.userQuestionId;
    const segmentUsers: Record<string, Set<string>> = {};

    // Initialize all options
    demographicQuestion.options?.forEach((opt) => {
      segmentUsers[opt.option] = new Set();
    });

    // Get all answers for this question
    const answersSnapshot = await db
      .collection(Collections.usersData)
      .where('userQuestionId', '==', questionId)
      .get();

    answersSnapshot.docs.forEach((doc) => {
      const data = doc.data() as UserDataDoc;
      const odlUserId = data.odlUserId;

      if (data.answer && segmentUsers[data.answer]) {
        segmentUsers[data.answer].add(odlUserId);
      }

      if (data.answerOptions) {
        data.answerOptions.forEach((opt) => {
          if (segmentUsers[opt]) {
            segmentUsers[opt].add(odlUserId);
          }
        });
      }
    });

    // 4. Get all interaction data
    const [approvalsSnap, commentsSnap] = await Promise.all([
      db.collection(Collections.approval).where('documentId', '==', docId).get(),
      db.collection(Collections.statements)
        .where('topParentId', '==', docId)
        .where('statementType', '==', StatementType.statement)
        .get(),
    ]);

    // Build maps: paragraphId -> userId -> approval (boolean)
    const approvalsByUserAndParagraph: Record<string, Record<string, boolean>> = {};
    approvalsSnap.docs.forEach((doc) => {
      const data = doc.data() as ApprovalDoc;
      const paragraphId = data.paragraphId || data.statementId;
      const odlUserId = data.odlUserId || data.odluserId || data.userId;

      if (paragraphId && odlUserId && paragraphIds.includes(paragraphId)) {
        if (!approvalsByUserAndParagraph[paragraphId]) {
          approvalsByUserAndParagraph[paragraphId] = {};
        }
        approvalsByUserAndParagraph[paragraphId][odlUserId] = data.approval;
      }
    });

    // Build maps: paragraphId -> userId -> comment count
    const commentsByUserAndParagraph: Record<string, Record<string, number>> = {};
    commentsSnap.docs.forEach((doc) => {
      const data = doc.data() as Statement;
      if (!data.hide && data.creatorId && paragraphIds.includes(data.parentId)) {
        if (!commentsByUserAndParagraph[data.parentId]) {
          commentsByUserAndParagraph[data.parentId] = {};
        }
        commentsByUserAndParagraph[data.parentId][data.creatorId] =
          (commentsByUserAndParagraph[data.parentId][data.creatorId] || 0) + 1;
      }
    });

    // Check k-anonymity
    const isDev = process.env.NODE_ENV === 'development';
    const minSegmentSize = isDev ? 0 : DEMOGRAPHIC_CONSTANTS.MIN_SEGMENT_SIZE;

    // 5. Calculate collaboration data for each paragraph
    const paragraphsData: ParagraphCollaborationData[] = [];
    let polarizedCount = 0;
    let collaborativeCount = 0;
    let mixedCount = 0;

    paragraphs.forEach((paragraph, index) => {
      const paragraphId = paragraph.paragraphId;
      const paragraphApprovals = approvalsByUserAndParagraph[paragraphId] || {};
      const paragraphComments = commentsByUserAndParagraph[paragraphId] || {};

      // Calculate segment data
      const segments: SegmentData[] = [];
      const segmentMeans: number[] = [];

      demographicQuestion.options?.forEach((option) => {
        const segmentValue = option.option;
        const usersInSegment = segmentUsers[segmentValue];
        const userCount = usersInSegment.size;

        // Skip segments below k-anonymity threshold
        if (userCount < minSegmentSize) return;

        // Calculate approvals for this segment
        let approvalCount = 0;
        let rejectionCount = 0;
        const approvalValues: number[] = []; // -1 or 1 for each user

        usersInSegment.forEach((userId) => {
          if (userId in paragraphApprovals) {
            if (paragraphApprovals[userId]) {
              approvalCount++;
              approvalValues.push(1);
            } else {
              rejectionCount++;
              approvalValues.push(-1);
            }
          }
        });

        // Calculate segment statistics
        const { mad, mean } = calcMAD(approvalValues);
        const totalVotes = approvalCount + rejectionCount;
        const approvalRate = totalVotes > 0 ? approvalCount / totalVotes : 0;

        // Count comments for this segment
        let commentCount = 0;
        usersInSegment.forEach((userId) => {
          commentCount += paragraphComments[userId] || 0;
        });

        if (totalVotes > 0) {
          segmentMeans.push(mean);
        }

        segments.push({
          segmentId: `${questionId}-${segmentValue}`,
          segmentName: demographicQuestion.question,
          segmentValue,
          userCount,
          approvalCount,
          rejectionCount,
          approvalRate: Math.round(approvalRate * 100) / 100,
          meanApproval: Math.round(mean * 100) / 100,
          mad: Math.round(mad * 100) / 100,
          internalAgreement: classifyInternalAgreement(mad),
          commentCount,
        });
      });

      // Calculate divergence score (MAD across segment means)
      const { mad: divergenceScore } = calcMAD(segmentMeans);

      // Calculate totals
      const totalApprovals = Object.values(paragraphApprovals).filter(v => v === true).length;
      const totalRejections = Object.values(paragraphApprovals).filter(v => v === false).length;
      const totalComments = Object.values(paragraphComments).reduce((sum, count) => sum + count, 0);
      const totalVotes = totalApprovals + totalRejections;
      const overallApproval = totalVotes > 0
        ? Math.round(((totalApprovals - totalRejections) / totalVotes) * 100) / 100
        : 0;

      // Classify collaboration status
      const collaborationStatus = classifyCollaborationStatus(divergenceScore);

      if (collaborationStatus === 'polarized') polarizedCount++;
      else if (collaborationStatus === 'collaborative') collaborativeCount++;
      else mixedCount++;

      paragraphsData.push({
        paragraphId,
        paragraphText: paragraph.content,
        paragraphIndex: index + 1,
        overallApproval,
        divergenceScore: Math.round(divergenceScore * 100) / 100,
        collaborationStatus,
        segments,
        totalComments,
        totalApprovals,
        totalRejections,
      });
    });

    // Sort by divergence score (most polarized first)
    paragraphsData.sort((a, b) => b.divergenceScore - a.divergenceScore);

    const response: CollaborationIndexResponse = {
      documentTitle,
      documentId: docId,
      totalParagraphs: paragraphs.length,
      polarizedCount,
      collaborativeCount,
      mixedCount,
      demographicQuestion: {
        questionId: demographicQuestion.userQuestionId,
        question: demographicQuestion.question,
        options: demographicQuestion.options || [],
      },
      paragraphs: paragraphsData,
    };

    console.info(`[Collaboration API] Generated data for ${docId}: ${paragraphsData.length} paragraphs, ${polarizedCount} polarized, ${collaborativeCount} collaborative`);

    return NextResponse.json(response);
  } catch (error) {
    logger.error('[Collaboration API] Error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
