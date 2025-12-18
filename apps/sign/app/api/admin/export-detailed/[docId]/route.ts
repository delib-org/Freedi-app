import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections, StatementType, Statement } from '@freedi/shared-types';
import { StatementWithParagraphs, Paragraph, DemographicMode } from '@/types';
import { getDemographicQuestions } from '@/lib/firebase/demographicQueries';
import { SignDemographicQuestion } from '@/types/demographics';
import { logger } from '@/lib/utils/logger';

const PARAGRAPH_VIEWS_COLLECTION = 'paragraphViews';

interface ApprovalDoc {
  paragraphId?: string;
  statementId?: string;
  approval: boolean;
  userId: string;
  odlUserId?: string;
}

interface ParagraphViewDoc {
  paragraphId: string;
  visitorId: string;
  documentId: string;
}

interface EvaluationDoc {
  statementId: string;
  evaluatorId: string;
  evaluation: number; // -1 to 1 scale
  parentId?: string;
}

interface CommentWithEvaluations extends Statement {
  likes: number;
  dislikes: number;
}

interface ParagraphData {
  paragraphId: string;
  order: number;
  type: string;
  content: string;
  isNonInteractive: boolean;
  viewsCount: number;
  viewsPercentage: number;
  approvalsCount: number;
  rejectionsCount: number;
  approvalRate: number;
  commentsCount: number;
  comments: CommentWithEvaluations[];
}

interface UserResponse {
  odlUserId: string;
  displayName?: string;
  answers: Record<string, string | string[] | undefined>;
}

/**
 * GET /api/admin/export-detailed/[docId]
 * Exports comprehensive document data as CSV including:
 * - Document title
 * - All paragraphs with views, approvals, comments
 * - Comments with likes/dislikes
 * - Demographics (if enabled)
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

    // 1. Get the document
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
    const paragraphs: Paragraph[] = document.paragraphs || [];
    const paragraphIds = paragraphs.map((p) => p.paragraphId);

    // 2. Get all approvals for the document
    const approvalsSnap = await db
      .collection(Collections.approval)
      .where('documentId', '==', docId)
      .get();

    const approvalsByParagraph: Record<string, { approved: number; rejected: number }> = {};
    approvalsSnap.docs.forEach((doc) => {
      const approval = doc.data() as ApprovalDoc;
      const paragraphId = approval.paragraphId || approval.statementId;

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

    // 3. Get all comments for the document
    const commentsSnap = await db
      .collection(Collections.statements)
      .where('topParentId', '==', docId)
      .where('statementType', '==', StatementType.statement)
      .get();

    const commentsByParagraph: Record<string, Statement[]> = {};
    const commentIds: string[] = [];
    commentsSnap.docs.forEach((doc) => {
      const comment = doc.data() as Statement;
      if (!comment.hide && paragraphIds.includes(comment.parentId)) {
        if (!commentsByParagraph[comment.parentId]) {
          commentsByParagraph[comment.parentId] = [];
        }
        commentsByParagraph[comment.parentId].push(comment);
        commentIds.push(comment.statementId);
      }
    });

    // 4. Get evaluations (likes/dislikes) for comments
    const evaluationsByComment: Record<string, { likes: number; dislikes: number }> = {};
    if (commentIds.length > 0) {
      const evaluationsSnap = await db
        .collection(Collections.evaluations)
        .where('documentId', '==', docId)
        .get();

      evaluationsSnap.docs.forEach((doc) => {
        const evaluation = doc.data() as EvaluationDoc;
        if (commentIds.includes(evaluation.statementId)) {
          if (!evaluationsByComment[evaluation.statementId]) {
            evaluationsByComment[evaluation.statementId] = { likes: 0, dislikes: 0 };
          }
          // evaluation is -1 to 1: positive = like, negative = dislike
          if (evaluation.evaluation > 0) {
            evaluationsByComment[evaluation.statementId].likes++;
          } else if (evaluation.evaluation < 0) {
            evaluationsByComment[evaluation.statementId].dislikes++;
          }
        }
      });
    }

    // 5. Get views
    const viewsSnap = await db
      .collection(PARAGRAPH_VIEWS_COLLECTION)
      .where('documentId', '==', docId)
      .get();

    const totalVisitors = new Set(
      viewsSnap.docs.map((doc) => (doc.data() as ParagraphViewDoc).visitorId)
    ).size;

    const viewsByParagraph: Record<string, Set<string>> = {};
    viewsSnap.docs.forEach((doc) => {
      const view = doc.data() as ParagraphViewDoc;
      if (paragraphIds.includes(view.paragraphId)) {
        if (!viewsByParagraph[view.paragraphId]) {
          viewsByParagraph[view.paragraphId] = new Set();
        }
        viewsByParagraph[view.paragraphId].add(view.visitorId);
      }
    });

    // 6. Get demographics if enabled
    const topParentId = documentData?.topParentId || docId;
    const signSettings = documentData?.signSettings || {};
    const demographicMode: DemographicMode = (signSettings?.demographicMode as DemographicMode) || 'disabled';

    let demographicQuestions: SignDemographicQuestion[] = [];
    let demographicResponses: UserResponse[] = [];

    if (demographicMode !== 'disabled') {
      demographicQuestions = await getDemographicQuestions(docId, demographicMode, topParentId);

      if (demographicQuestions.length > 0) {
        const questionIds = demographicQuestions
          .map((q) => q.userQuestionId)
          .filter(Boolean) as string[];

        const responsesMap = new Map<string, UserResponse>();

        for (const questionId of questionIds) {
          const answersSnapshot = await db
            .collection(Collections.usersData)
            .where('userQuestionId', '==', questionId)
            .get();

          answersSnapshot.docs.forEach((doc) => {
            const data = doc.data();
            const odlUserId = data.odlUserId || data.userId;

            if (!odlUserId) return;

            if (!responsesMap.has(odlUserId)) {
              responsesMap.set(odlUserId, {
                odlUserId,
                displayName: data.displayName,
                answers: {},
              });
            }

            const userResponse = responsesMap.get(odlUserId)!;
            if (data.answer) {
              userResponse.answers[questionId] = data.answer;
            } else if (data.answerOptions && data.answerOptions.length > 0) {
              userResponse.answers[questionId] = data.answerOptions;
            }
          });
        }

        demographicResponses = Array.from(responsesMap.values());
      }
    }

    // 7. Build paragraph data
    const paragraphData: ParagraphData[] = paragraphs.map((p) => {
      const approvals = approvalsByParagraph[p.paragraphId] || { approved: 0, rejected: 0 };
      const total = approvals.approved + approvals.rejected;
      const approvalRate = total > 0
        ? Math.round(((approvals.approved - approvals.rejected) / total) * 100) / 100
        : 0;

      const views = viewsByParagraph[p.paragraphId]?.size || 0;
      const viewsPercentage = totalVisitors > 0
        ? Math.round((views / totalVisitors) * 100)
        : 0;

      const comments = (commentsByParagraph[p.paragraphId] || []).map((comment) => ({
        ...comment,
        likes: evaluationsByComment[comment.statementId]?.likes || 0,
        dislikes: evaluationsByComment[comment.statementId]?.dislikes || 0,
      }));

      return {
        paragraphId: p.paragraphId,
        order: p.order,
        type: p.type,
        content: p.content,
        isNonInteractive: p.isNonInteractive || false,
        viewsCount: views,
        viewsPercentage,
        approvalsCount: approvals.approved,
        rejectionsCount: approvals.rejected,
        approvalRate,
        commentsCount: comments.length,
        comments,
      };
    });

    // 8. Build CSV
    const escapeCSV = (value: string | number | boolean): string => {
      const strValue = String(value);
      if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
        return `"${strValue.replace(/"/g, '""')}"`;
      }
      return strValue;
    };

    // Find max comments across all paragraphs for column headers
    const maxComments = Math.max(...paragraphData.map((p) => p.comments.length), 0);

    // Build header row
    const baseHeaders = [
      'Document Title',
      'Paragraph Order',
      'Paragraph Type',
      'Paragraph Content',
      'Is Non-Interactive',
      'Views Count',
      'Views Percentage',
      'Approvals Count',
      'Rejections Count',
      'Approval Rate',
      'Comments Count',
    ];

    // Add comment columns
    const commentHeaders: string[] = [];
    for (let i = 1; i <= maxComments; i++) {
      commentHeaders.push(
        `Comment ${i} Text`,
        `Comment ${i} Author`,
        `Comment ${i} Likes`,
        `Comment ${i} Dislikes`
      );
    }

    // Add demographic columns
    const demographicHeaders = demographicQuestions.map((q) => escapeCSV(q.question));

    const csvHeader = [...baseHeaders, ...commentHeaders, ...demographicHeaders];

    // Build data rows
    const csvRows: string[][] = [];

    paragraphData.forEach((p) => {
      const baseRow = [
        documentTitle,
        String(p.order),
        p.type,
        p.content,
        String(p.isNonInteractive),
        String(p.viewsCount),
        `${p.viewsPercentage}%`,
        String(p.approvalsCount),
        String(p.rejectionsCount),
        String(p.approvalRate),
        String(p.commentsCount),
      ];

      // Add comment data
      const commentData: string[] = [];
      for (let i = 0; i < maxComments; i++) {
        const comment = p.comments[i];
        if (comment) {
          commentData.push(
            comment.statement,
            comment.creator?.displayName || 'Anonymous',
            String(comment.likes),
            String(comment.dislikes)
          );
        } else {
          commentData.push('', '', '', '');
        }
      }

      // Add demographic data (empty for paragraph rows - demographics are per-user)
      const demographicData = demographicQuestions.map(() => '');

      csvRows.push([...baseRow, ...commentData, ...demographicData]);
    });

    // Add demographics summary section if there are responses
    if (demographicResponses.length > 0) {
      // Add empty row separator
      csvRows.push(Array(csvHeader.length).fill(''));
      csvRows.push(['--- DEMOGRAPHICS SUMMARY ---', ...Array(csvHeader.length - 1).fill('')]);
      csvRows.push(['User ID', 'Display Name', ...demographicQuestions.map((q) => q.question), ...Array(csvHeader.length - 2 - demographicQuestions.length).fill('')]);

      demographicResponses.forEach((response) => {
        const row = [
          response.odlUserId,
          response.displayName || 'Anonymous',
        ];

        demographicQuestions.forEach((q) => {
          const answer = response.answers[q.userQuestionId || ''];
          if (Array.isArray(answer)) {
            row.push(answer.join('; '));
          } else {
            row.push(answer || '');
          }
        });

        // Fill remaining columns
        while (row.length < csvHeader.length) {
          row.push('');
        }

        csvRows.push(row);
      });
    }

    // Generate CSV string
    const csvContent = [
      csvHeader.map(escapeCSV).join(','),
      ...csvRows.map((row) => row.map(escapeCSV).join(',')),
    ].join('\n');

    console.info(`[API] Detailed export for ${docId}: ${paragraphData.length} paragraphs, ${demographicResponses.length} demographic responses`);

    // Return CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="document-detailed-${docId}.csv"`,
      },
    });
  } catch (error) {
    logger.error('[API] Detailed export failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
