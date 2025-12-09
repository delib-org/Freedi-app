import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, StatementType, Statement } from 'delib-npm';
import { StatementWithParagraphs, Paragraph } from '@/types';
import { HeatMapData } from '@/types/heatMap';

const PARAGRAPH_VIEWS_COLLECTION = 'paragraphViews';

interface ApprovalDoc {
  paragraphId?: string;
  statementId?: string;
  approval: boolean;
  userId: string;
}

interface ParagraphViewDoc {
  paragraphId: string;
  visitorId: string;
  documentId: string;
}

/**
 * GET /api/heatmap/[docId]
 * Get aggregated heat map data for a document
 * Returns approval rates, comment counts, ratings, and viewership for all paragraphs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;

    const db = getFirestoreAdmin();

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
    viewsSnapshot.docs.forEach((doc) => {
      const view = doc.data() as ParagraphViewDoc;
      if (paragraphIds.includes(view.paragraphId)) {
        if (!viewsByParagraph[view.paragraphId]) {
          viewsByParagraph[view.paragraphId] = new Set();
        }
        viewsByParagraph[view.paragraphId].add(view.visitorId);
      }
    });

    // Convert to percentages (of total visitors to document)
    Object.entries(viewsByParagraph).forEach(([id, visitors]) => {
      heatMapData.viewership[id] = totalVisitors > 0
        ? Math.round((visitors.size / totalVisitors) * 100)
        : 0;
    });

    console.info(`[HeatMap API] Generated heat map data for ${docId}: ${paragraphIds.length} paragraphs`);

    return NextResponse.json({ data: heatMapData });
  } catch (error) {
    console.error('[HeatMap API] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
