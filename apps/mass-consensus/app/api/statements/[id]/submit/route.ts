import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, StatementType, createStatementObject, SourceApp } from '@freedi/shared-types';
import { getUserIdFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import { logError, ValidationError } from '@/lib/utils/errorHandling';
import { VALIDATION, ERROR_MESSAGES } from '@/constants/common';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { countWords } from '@/lib/utils/wordCount';
import { logResearchAction } from '@/lib/utils/researchLogger';
import { ResearchAction } from '@freedi/shared-types';
import { FieldValue } from 'firebase-admin/firestore';
import {
  applyEvaluationWrites,
  upsertEvaluation,
  userEvaluationDocId,
} from '@/lib/firebase/evaluations/evaluationWrites';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * Handle user selecting an existing solution (create evaluation +1)
 */
async function handleExistingSolution(
  db: Firestore,
  statementId: string,
  questionId: string,
  userId: string,
  displayName: string,
) {
  // Check if statement exists
  const statementDoc = await db
    .collection(Collections.statements)
    .doc(statementId)
    .get();

  if (!statementDoc.exists) {
    logError(new ValidationError('Solution not found'), {
      operation: 'api.submit.handleExistingSolution',
      userId,
      questionId,
      statementId,
    });

    return NextResponse.json({ error: 'Solution not found' }, { status: 404 });
  }

  // +1 for agreement, through the same deterministic-id path as swiping so a
  // later swipe on this card updates this evaluation instead of adding a second
  // one, and the card is filtered out of the user's deck.
  const statementRef = db.collection(Collections.statements).doc(statementId);
  const questionRef = db.collection(Collections.statements).doc(questionId);

  const { evaluationId, created } = await upsertEvaluation(
    db,
    {
      statementId,
      parentId: questionId,
      userId,
      displayName,
      evaluation: 1,
    },
    // Legacy counters, bumped only the first time this user rates this option.
    // `consensus` is a score in [-1, 1], not a counter — it used to be
    // incremented here too, which corrupted the field by one per vote. The
    // onCreateEvaluation trigger owns it and the other aggregates.
    (transaction) => {
      transaction.update(statementRef, {
        evaluations: FieldValue.increment(1),
        lastUpdate: Date.now(),
      });
      transaction.update(questionRef, {
        suggestions: FieldValue.increment(1),
        lastUpdate: Date.now(),
      });
    },
  );

  return NextResponse.json({
    success: true,
    action: 'evaluated' as const,
    statementId,
    evaluationId,
    created,
  });
}

/**
 * POST /api/statements/[id]/submit
 * Submit a new solution (option) for a question OR evaluate an existing solution
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: questionId } = await params;

  // Rate limit check - stricter for write operations
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.WRITE);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const { solutionText, userId: bodyUserId, userName, existingStatementId } = body;

    // Get user ID
    const cookieUserId = getUserIdFromCookie(request.headers.get('cookie'));
    const userId = bodyUserId || cookieUserId;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Validate solution text
    if (!solutionText || typeof solutionText !== 'string') {
      return NextResponse.json(
        { error: 'Solution text is required' },
        { status: 400 }
      );
    }

    const trimmedText = solutionText.trim();

    if (trimmedText.length < VALIDATION.MIN_SOLUTION_LENGTH) {
      return NextResponse.json(
        {
          error: `Solution must be at least ${VALIDATION.MIN_SOLUTION_LENGTH} characters`,
        },
        { status: 400 }
      );
    }

    if (trimmedText.length > VALIDATION.MAX_SOLUTION_LENGTH) {
      return NextResponse.json(
        {
          error: `Solution must be less than ${VALIDATION.MAX_SOLUTION_LENGTH} characters`,
        },
        { status: 400 }
      );
    }
    const db = getFirestoreAdmin();

    // The question and the user's evaluation mirror are independent reads;
    // fetch them together rather than one after the other.
    const [questionDoc, userEvaluationDoc] = await Promise.all([
      db.collection(Collections.statements).doc(questionId).get(),
      db.collection(Collections.userEvaluations).doc(userEvaluationDocId(userId, questionId)).get(),
    ]);

    if (!questionDoc.exists) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }

    const questionData = questionDoc.data();
    const displayName = userName || getAnonymousDisplayName(userId);

    // If user selected an existing solution, create evaluation instead
    if (existingStatementId) {
      return await handleExistingSolution(
        db,
        existingStatementId,
        questionId,
        userId,
        displayName,
      );
    }

    // Enforce the optional per-question minimum-word requirement. Only applies
    // to new free-text solutions and only when an admin has set a minimum > 0.
    const minResponseWords = questionData?.statementSettings?.minResponseWords;
    if (minResponseWords && minResponseWords > 0) {
      const wordCount = countWords(trimmedText);
      if (wordCount < minResponseWords) {
        return NextResponse.json(
          {
            error: `Your response must contain at least ${minResponseWords} words.`,
            code: 'MIN_WORDS',
            minWords: minResponseWords,
            wordCount,
          },
          { status: 400 }
        );
      }
    }

    // Check user limit for new solutions
    const numberOfOptionsPerUser = questionData?.statementSettings?.numberOfOptionsPerUser || Infinity;

    if (numberOfOptionsPerUser !== Infinity) {
      const userSolutionsQuery = await db
        .collection(Collections.statements)
        .where('parentId', '==', questionId)
        .where('creatorId', '==', userId)
        .where('statementType', '==', StatementType.option)
        .count()
        .get();

      const userSolutionsCount = userSolutionsQuery.data().count;

      if (userSolutionsCount >= numberOfOptionsPerUser) {
        return NextResponse.json(
          {
            error: `You've reached the maximum of ${numberOfOptionsPerUser} solution(s) for this question`,
            code: 'LIMIT_REACHED'
          },
          { status: 403 }
        );
      }
    }

    // Create new solution statement
    const statementRef = db.collection(Collections.statements).doc();

    // MC has a single input field — store it only as `statement` to avoid
    // duplicating the same text as both title and description in downstream views.
    const newSolution = createStatementObject({
      statementId: statementRef.id,
      statement: trimmedText,
      statementType: StatementType.option,
      parentId: questionId,
      topParentId: questionData?.topParentId || questionId,
      creatorId: userId,
      creator: {
        uid: userId,
        displayName,
        email: '',
        photoURL: '',
        isAnonymous: true,
      },
      sourceApp: SourceApp.MASS_CONSENSUS,
    });

    if (!newSolution) {
      return NextResponse.json(
        { error: 'Failed to create solution' },
        { status: 500 }
      );
    }

    // The author's automatic +1 goes through the same deterministic-id path as
    // swiping, so the new option is also filtered out of the author's own deck.
    // The option is brand new, so no evaluation can exist yet; only the
    // userEvaluations mirror (read above) may already exist for this question.
    // Batch to create solution, evaluation, and update question counters atomically
    const writeBatch = db.batch();

    // Create new solution
    writeBatch.set(statementRef, newSolution);

    // Create automatic evaluation (+1 when user creates their own solution)
    const evaluationId = applyEvaluationWrites(
      writeBatch,
      db,
      {
        statementId: statementRef.id,
        parentId: questionId,
        userId,
        displayName,
        evaluation: 1,
      },
      { userEvaluationExists: userEvaluationDoc.exists },
    );

    // Update parent question using FieldValue.increment for atomic counters
    const questionRef = db.collection(Collections.statements).doc(questionId);
    writeBatch.update(questionRef, {
      suggestions: FieldValue.increment(1),
      numberOfOptions: FieldValue.increment(1),
      lastUpdate: Date.now(),
    });

    await writeBatch.commit();

    // Research logging — check question's own settings or top parent's
    const topParentId = questionData?.topParentId || questionId;
    const researchEnabled = questionData?.statementSettings?.enableResearchLogging === true;
    logResearchAction(userId, ResearchAction.CREATE_STATEMENT, researchEnabled, {
      statementId: statementRef.id,
      parentId: questionId,
      topParentId,
    });

    return NextResponse.json({
      success: true,
      action: 'created' as const,
      statementId: statementRef.id,
      solution: newSolution,
      evaluationId,
    });
  } catch (error) {
    logError(error, {
      operation: 'api.submit',
      metadata: { questionId },
    });

    return NextResponse.json(
      {
        error: ERROR_MESSAGES.SUBMIT_FAILED,
        message: error instanceof Error ? error.message : ERROR_MESSAGES.GENERIC,
      },
      { status: 500 }
    );
  }
}
