import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';
import { isDerivedStatement } from '@/lib/utils/derivedStatements';
import { FieldPath, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

const EVAL_PAGE_SIZE = 500;
const SOLUTION_PAGE_SIZE = 500;

/**
 * GET /api/statements/[id]/stats
 * Get statistics for a statement (participant count, etc.)
 *
 * Definitions (aligned with the survey admin results panel):
 * - evaluatorCount: users who ACTIVELY rated a solution (evaluation rows with
 *   an `evaluator` object). Rows with only `evaluatorId` are the automatic
 *   +1 self-vote written when submitting one's own solution.
 * - creatorCount / totalSolutions: genuine user submissions only — option
 *   statements that are not pipeline-derived (cluster/synthesis spawns).
 * - participantCount: union of anyone who acted (any evaluation row or any
 *   genuine submission).
 * - enteredCount: unique statementViews entrants, never below participantCount.
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

    // Unique evaluators, paginated with .select('evaluatorId', 'evaluator').
    // The composite index (parentId ASC, evaluatorId ASC) already exists.
    const explicitEvaluators = new Set<string>();
    const allEvaluators = new Set<string>();
    let totalEvaluations = 0;
    let evalCursor: QueryDocumentSnapshot | null = null;
    for (;;) {
      let pageQuery = db
        .collection(Collections.evaluations)
        .where('parentId', '==', statementId)
        .orderBy('evaluatorId')
        .select('evaluatorId', 'evaluator')
        .limit(EVAL_PAGE_SIZE);
      if (evalCursor) pageQuery = pageQuery.startAfter(evalCursor);
      const page = await pageQuery.get();
      if (page.empty) break;

      page.docs.forEach((doc) => {
        const data = doc.data();
        if (data.evaluatorId) allEvaluators.add(data.evaluatorId);
        if (data.evaluator?.uid) explicitEvaluators.add(data.evaluator.uid);
      });
      totalEvaluations += page.size;

      if (page.size < EVAL_PAGE_SIZE) break;
      evalCursor = page.docs[page.docs.length - 1];
    }

    // Genuine solutions: option children minus pipeline-derived docs
    // (cluster/synthesis spawns are stored with statementType: option too).
    // OrderBy document ID so the page cursor works without requiring a new
    // composite index.
    const uniqueCreators = new Set<string>();
    let totalSolutions = 0;
    let solCursor: QueryDocumentSnapshot | null = null;
    for (;;) {
      let pageQuery = db
        .collection(Collections.statements)
        .where('parentId', '==', statementId)
        .where('statementType', '==', StatementType.option)
        .orderBy(FieldPath.documentId())
        .select(
          'creatorId',
          'isCluster',
          'derivedByPipeline',
          'integratedOptions',
          'synthesisRunId',
          'synthesisMechanism',
          'statementType'
        )
        .limit(SOLUTION_PAGE_SIZE);
      if (solCursor) pageQuery = pageQuery.startAfter(solCursor);
      const page = await pageQuery.get();
      if (page.empty) break;

      page.docs.forEach((doc) => {
        const data = doc.data();
        if (isDerivedStatement(data as Statement)) return;

        totalSolutions++;
        if (data.creatorId) uniqueCreators.add(data.creatorId);
      });

      if (page.size < SOLUTION_PAGE_SIZE) break;
      solCursor = page.docs[page.docs.length - 1];
    }

    // Total unique participants = anyone with an evaluation row (including
    // the auto +1 from submitting) + genuine solution creators (union)
    const allParticipants = new Set([...allEvaluators, ...uniqueCreators]);

    // Unique entrants: statementViews docs are one-per-user-per-question
    // (`${userId}--${statementId}`), so an aggregate count == unique users
    // who entered. View tracking started mid-project, so never report
    // fewer entrants than known participants.
    let enteredCount = 0;
    try {
      const viewsCount = await db
        .collection(Collections.statementViews)
        .where('statementId', '==', statementId)
        .count()
        .get();
      enteredCount = viewsCount.data().count;
    } catch (error) {
      logError(error, { operation: 'api.stats.viewsCount' });
    }
    enteredCount = Math.max(enteredCount, allParticipants.size);

    return NextResponse.json({
      participantCount: allParticipants.size,
      evaluatorCount: explicitEvaluators.size,
      creatorCount: uniqueCreators.size,
      enteredCount,
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
