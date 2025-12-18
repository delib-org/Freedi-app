import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections, StatementType, Statement, DEMOGRAPHIC_CONSTANTS } from '@freedi/shared-types';
import { StatementWithParagraphs, Paragraph } from '@/types';
import { logger } from '@/lib/utils/logger';

interface ApprovalDoc {
  paragraphId?: string;
  statementId?: string;
  approval: boolean;
  odlUserId?: string;
  odluserId?: string;
  userId?: string;
}

interface EvaluationDoc {
  statementId: string;
  evaluatorId?: string;
  odlUserId?: string;
  odluserId?: string;
  evaluation: number;
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
  type: string;
  options?: Array<{ option: string }>;
  scope?: string;
}

interface SegmentStats {
  approvals: number;
  rejections: number;
  approvalRate: number;
  comments: number;
  avgRating: number;
  ratingCount: number;
  views: number;
  viewsPercentage: number;
  userCount: number;
}

/**
 * GET /api/admin/export-demographic/[docId]
 * Exports demographic comparison data as CSV
 * Shows how each demographic segment interacted with each paragraph
 *
 * CSV Format (long format for easy pivot table analysis):
 * Paragraph Order | Paragraph Content | Question | Segment | Users | Approvals | Rejections | Approval Rate | Comments | Avg Rating | Views | Views %
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
    const paragraphs: Paragraph[] = document.paragraphs || [];
    const paragraphIds = paragraphs.map((p) => p.paragraphId);
    const topParentId = documentData?.topParentId || docId;

    // 2. Get demographic questions
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

    // Filter to radio/checkbox questions with options
    const demographicQuestions = allQuestions.filter(
      (q) => q.options && q.options.length > 0 && (q.type === 'radio' || q.type === 'checkbox')
    );

    if (demographicQuestions.length === 0) {
      return NextResponse.json(
        { error: 'No demographic questions found for this document' },
        { status: 400 }
      );
    }

    // 3. Build user-to-segments mapping for each question
    // Map: questionId -> segmentValue -> Set<userId>
    const segmentUsers: Record<string, Record<string, Set<string>>> = {};

    for (const question of demographicQuestions) {
      const questionId = question.userQuestionId;
      segmentUsers[questionId] = {};

      // Initialize all options
      question.options?.forEach((opt) => {
        segmentUsers[questionId][opt.option] = new Set();
      });

      // Get all answers for this question
      const answersSnapshot = await db
        .collection(Collections.usersData)
        .where('userQuestionId', '==', questionId)
        .get();

      answersSnapshot.docs.forEach((doc) => {
        const data = doc.data() as UserDataDoc;
        const odlUserId = data.odlUserId;

        if (data.answer && segmentUsers[questionId][data.answer]) {
          segmentUsers[questionId][data.answer].add(odlUserId);
        }

        if (data.answerOptions) {
          data.answerOptions.forEach((opt) => {
            if (segmentUsers[questionId][opt]) {
              segmentUsers[questionId][opt].add(odlUserId);
            }
          });
        }
      });
    }

    // 4. Get all interaction data
    const [approvalsSnap, commentsSnap, evaluationsSnap, viewsSnap] = await Promise.all([
      db.collection(Collections.approval).where('documentId', '==', docId).get(),
      db.collection(Collections.statements)
        .where('topParentId', '==', docId)
        .where('statementType', '==', StatementType.statement)
        .get(),
      db.collection(Collections.evaluations).where('documentId', '==', docId).get(),
      db.collection('paragraphViews').where('documentId', '==', docId).get(),
    ]);

    // Build maps of interactions by user
    // Approvals: paragraphId -> userId -> approval (boolean)
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

    // Comments: paragraphId -> userId -> count
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

    // Map comments to paragraphs for evaluations
    const commentToParagraph: Record<string, string> = {};
    commentsSnap.docs.forEach((doc) => {
      const data = doc.data() as Statement;
      if (!data.hide && paragraphIds.includes(data.parentId)) {
        commentToParagraph[data.statementId] = data.parentId;
      }
    });

    // Evaluations: paragraphId -> userId -> evaluation values
    const evaluationsByUserAndParagraph: Record<string, Record<string, number[]>> = {};
    evaluationsSnap.docs.forEach((doc) => {
      const data = doc.data() as EvaluationDoc;
      const paragraphId = commentToParagraph[data.statementId];
      const odlUserId = data.odlUserId || data.odluserId || data.evaluatorId;

      if (paragraphId && odlUserId) {
        if (!evaluationsByUserAndParagraph[paragraphId]) {
          evaluationsByUserAndParagraph[paragraphId] = {};
        }
        if (!evaluationsByUserAndParagraph[paragraphId][odlUserId]) {
          evaluationsByUserAndParagraph[paragraphId][odlUserId] = [];
        }
        evaluationsByUserAndParagraph[paragraphId][odlUserId].push(data.evaluation);
      }
    });

    // Views: paragraphId -> Set<userId>
    const viewsByParagraph: Record<string, Set<string>> = {};
    viewsSnap.docs.forEach((doc) => {
      const data = doc.data() as ParagraphViewDoc;
      if (paragraphIds.includes(data.paragraphId)) {
        if (!viewsByParagraph[data.paragraphId]) {
          viewsByParagraph[data.paragraphId] = new Set();
        }
        viewsByParagraph[data.paragraphId].add(data.visitorId);
      }
    });

    // 5. Calculate stats for each paragraph × question × segment
    const csvRows: string[][] = [];

    // Check if k-anonymity should be enforced
    const isDev = process.env.NODE_ENV === 'development';
    const minSegmentSize = isDev ? 0 : DEMOGRAPHIC_CONSTANTS.MIN_SEGMENT_SIZE;

    paragraphs.forEach((paragraph) => {
      if (paragraph.isNonInteractive) return;

      const paragraphId = paragraph.paragraphId;

      demographicQuestions.forEach((question) => {
        const questionId = question.userQuestionId;

        question.options?.forEach((option) => {
          const segmentValue = option.option;
          const usersInSegment = segmentUsers[questionId][segmentValue];
          const userCount = usersInSegment.size;

          // Skip segments below k-anonymity threshold
          if (userCount < minSegmentSize) return;

          // Calculate stats for this segment
          const stats: SegmentStats = {
            approvals: 0,
            rejections: 0,
            approvalRate: 0,
            comments: 0,
            avgRating: 0,
            ratingCount: 0,
            views: 0,
            viewsPercentage: 0,
            userCount,
          };

          // Count approvals/rejections
          const paragraphApprovals = approvalsByUserAndParagraph[paragraphId] || {};
          usersInSegment.forEach((userId) => {
            if (userId in paragraphApprovals) {
              if (paragraphApprovals[userId]) {
                stats.approvals++;
              } else {
                stats.rejections++;
              }
            }
          });

          const totalVotes = stats.approvals + stats.rejections;
          stats.approvalRate = totalVotes > 0
            ? Math.round(((stats.approvals - stats.rejections) / totalVotes) * 100)
            : 0;

          // Count comments
          const paragraphComments = commentsByUserAndParagraph[paragraphId] || {};
          usersInSegment.forEach((userId) => {
            stats.comments += paragraphComments[userId] || 0;
          });

          // Calculate average rating
          const paragraphEvaluations = evaluationsByUserAndParagraph[paragraphId] || {};
          const ratings: number[] = [];
          usersInSegment.forEach((userId) => {
            if (paragraphEvaluations[userId]) {
              ratings.push(...paragraphEvaluations[userId]);
            }
          });
          if (ratings.length > 0) {
            const avgRaw = ratings.reduce((a, b) => a + b, 0) / ratings.length;
            // Convert from -1 to 1 scale to 0-5 scale
            stats.avgRating = Math.round(((avgRaw + 1) / 2) * 5 * 10) / 10;
            stats.ratingCount = ratings.length;
          }

          // Count views
          const paragraphViews = viewsByParagraph[paragraphId] || new Set();
          usersInSegment.forEach((userId) => {
            if (paragraphViews.has(userId)) {
              stats.views++;
            }
          });
          stats.viewsPercentage = userCount > 0
            ? Math.round((stats.views / userCount) * 100)
            : 0;

          // Add row
          csvRows.push([
            String(paragraph.order),
            paragraph.content.substring(0, 100) + (paragraph.content.length > 100 ? '...' : ''),
            question.question,
            segmentValue,
            String(stats.userCount),
            String(stats.approvals),
            String(stats.rejections),
            `${stats.approvalRate}%`,
            String(stats.comments),
            stats.ratingCount > 0 ? String(stats.avgRating) : '',
            String(stats.views),
            `${stats.viewsPercentage}%`,
          ]);
        });
      });
    });

    // 6. Build CSV
    const escapeCSV = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvHeader = [
      'Paragraph Order',
      'Paragraph Content',
      'Demographic Question',
      'Segment',
      'Users in Segment',
      'Approvals',
      'Rejections',
      'Approval Rate',
      'Comments',
      'Avg Rating (0-5)',
      'Views',
      'Views %',
    ];

    const csvContent = [
      csvHeader.map(escapeCSV).join(','),
      ...csvRows.map((row) => row.map(escapeCSV).join(',')),
    ].join('\n');

    console.info(`[API] Demographic export for ${docId}: ${csvRows.length} data rows`);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="demographic-analysis-${docId}.csv"`,
      },
    });
  } catch (error) {
    logger.error('[API] Demographic export failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
