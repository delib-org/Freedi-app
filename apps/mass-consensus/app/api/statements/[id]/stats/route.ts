import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';
import { FieldPath, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

const EVAL_PAGE_SIZE = 500;
const SOLUTION_PAGE_SIZE = 500;

/**
 * GET /api/statements/[id]/stats
 * Get statistics for a statement (participant count, etc.)
 *
 * Both collection reads are paginated via `startAfter` cursors so the
 * endpoint streams large parents instead of loading every evaluation/
 * statement into memory. Query Insights flagged the un-paginated form
 * at ~3.6s avg latency.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: statementId } = await params;
    const db = getFirestoreAdmin();

    // Count unique evaluators by paginating with .select('evaluatorId').
    // The composite index (parentId ASC, evaluatorId ASC) already exists.
    const uniqueEvaluators = new Set<string>();
    let totalEvaluations = 0;
    let evalCursor: QueryDocumentSnapshot | null = null;
    for (;;) {
      let pageQuery = db
        .collection(Collections.evaluations)
        .where('parentId', '==', statementId)
        .orderBy('evaluatorId')
        .select('evaluatorId')
        .limit(EVAL_PAGE_SIZE);
      if (evalCursor) pageQuery = pageQuery.startAfter(evalCursor);
      const page = await pageQuery.get();
      if (page.empty) break;

      page.docs.forEach((doc) => {
        const id = doc.data().evaluatorId;
        if (id) uniqueEvaluators.add(id);
      });
      totalEvaluations += page.size;

      if (page.size < EVAL_PAGE_SIZE) break;
      evalCursor = page.docs[page.docs.length - 1];
    }

    // Count unique solution creators by paginating with .select('creatorId').
    // OrderBy document ID so the page cursor works without requiring a new
    // composite index on (parentId, creatorId).
    const uniqueCreators = new Set<string>();
    let totalSolutions = 0;
    let solCursor: QueryDocumentSnapshot | null = null;
    for (;;) {
      let pageQuery = db
        .collection(Collections.statements)
        .where('parentId', '==', statementId)
        .orderBy(FieldPath.documentId())
        .select('creatorId')
        .limit(SOLUTION_PAGE_SIZE);
      if (solCursor) pageQuery = pageQuery.startAfter(solCursor);
      const page = await pageQuery.get();
      if (page.empty) break;

      page.docs.forEach((doc) => {
        const id = doc.data().creatorId;
        if (id) uniqueCreators.add(id);
      });
      totalSolutions += page.size;

      if (page.size < SOLUTION_PAGE_SIZE) break;
      solCursor = page.docs[page.docs.length - 1];
    }

    // Total unique participants = evaluators + creators (union)
    const allParticipants = new Set([...uniqueEvaluators, ...uniqueCreators]);

    return NextResponse.json({
      participantCount: allParticipants.size,
      evaluatorCount: uniqueEvaluators.size,
      creatorCount: uniqueCreators.size,
      totalEvaluations,
      totalSolutions,
    });
  } catch (error) {
    logError(error, {
      operation: 'api.stats',
    });

    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
