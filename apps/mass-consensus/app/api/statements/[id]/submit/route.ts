import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, StatementType, createStatementObject } from '@freedi/shared-types';
import { getUserIdFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import { logError, ValidationError } from '@/lib/utils/errorHandling';
import { VALIDATION, ERROR_MESSAGES } from '@/constants/common';
import { textToParagraphs } from '@/lib/utils/paragraphUtils';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * Handle user selecting an existing solution (create evaluation +1)
 */
async function handleExistingSolution(
  db: Firestore,
  statementId: string,
  questionId: string,
  userId: string,
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

  // Create evaluation (+1 for agreement)
  const evaluationRef = db.collection(Collections.evaluations).doc();
  const evaluation = {
    evaluationId: evaluationRef.id,
    statementId,
    parentId: questionId,
    evaluatorId: userId,
    evaluation: 1, // Auto +1 when user selects this solution
    createdAt: Date.now(),
    lastUpdate: Date.now(),
  };

  // Use FieldValue.increment for atomic counter updates (no stale reads)
  const statementRef = db.collection(Collections.statements).doc(statementId);
  const questionRef = db.collection(Collections.statements).doc(questionId);
  const batch = db.batch();

  batch.set(evaluationRef, evaluation);

  batch.update(statementRef, {
    evaluations: FieldValue.increment(1),
    consensus: FieldValue.increment(1),
    lastUpdate: Date.now(),
  });

  batch.update(questionRef, {
    suggestions: FieldValue.increment(1),
    lastUpdate: Date.now(),
  });

  await batch.commit();

  return NextResponse.json({
    success: true,
    action: 'evaluated' as const,
    statementId,
    evaluation,
  });
}

/**
 * POST /api/statements/[id]/submit
 * Submit a new solution (option) for a question OR evaluate an existing solution
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Rate limit check - stricter for write operations
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.WRITE);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const { solutionText, userId: bodyUserId, userName, existingStatementId, generatedTitle, generatedDescription } = body;

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

    const questionId = params.id;
    const db = getFirestoreAdmin();

    // Check if question exists
    const questionDoc = await db
      .collection(Collections.statements)
      .doc(questionId)
      .get();

    if (!questionDoc.exists) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }

    const questionData = questionDoc.data();

    // If user selected an existing solution, create evaluation instead
    if (existingStatementId) {
      return await handleExistingSolution(
        db,
        existingStatementId,
        questionId,
        userId,
      );
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

    const displayName = userName || getAnonymousDisplayName(userId);

    // Use title and description from check-similar response if provided,
    // otherwise create a simple title/description from the text
    let title: string;
    let description: string;

    logger.info('[Submit] AI generated title:', generatedTitle);
    logger.info('[Submit] AI generated description:', generatedDescription);

    if (generatedTitle && generatedDescription) {
      // Use AI-generated values
      title = generatedTitle;
      description = generatedDescription;
    } else {
      // Fallback: create title and description from the text
      if (trimmedText.length > 60) {
        // Long text: truncate title, use full text as description
        title = trimmedText.substring(0, 57) + '...';
        description = trimmedText;
      } else {
        // Short text: use as title, add context to description
        title = trimmedText;
        description = `Proposed solution: ${trimmedText}`;
      }
    }

    // Use shared utility to create properly structured statement
    const newSolution = createStatementObject({
      statementId: statementRef.id,
      statement: title,
      paragraphs: textToParagraphs(description),
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
    });

    if (!newSolution) {
      return NextResponse.json(
        { error: 'Failed to create solution' },
        { status: 500 }
      );
    }

    // Create automatic +1 evaluation for the new solution
    const evaluationRef = db.collection(Collections.evaluations).doc();
    const evaluation = {
      evaluationId: evaluationRef.id,
      statementId: statementRef.id,
      parentId: questionId,
      evaluatorId: userId,
      evaluation: 1, // Auto +1 when user creates their own solution
      createdAt: Date.now(),
      lastUpdate: Date.now(),
    };

    // Batch to create solution, evaluation, and update question counters atomically
    const writeBatch = db.batch();

    // Create new solution
    writeBatch.set(statementRef, newSolution);

    // Create automatic evaluation
    writeBatch.set(evaluationRef, evaluation);

    // Update parent question using FieldValue.increment for atomic counters
    const questionRef = db.collection(Collections.statements).doc(questionId);
    writeBatch.update(questionRef, {
      suggestions: FieldValue.increment(1),
      numberOfOptions: FieldValue.increment(1),
      lastUpdate: Date.now(),
    });

    await writeBatch.commit();

    return NextResponse.json({
      success: true,
      action: 'created' as const,
      statementId: statementRef.id,
      solution: newSolution,
      evaluation,
    });
  } catch (error) {
    const body = await request.json().catch(() => ({}));
    const { userId } = body;
    const questionId = params.id;

    logError(error, {
      operation: 'api.submit',
      userId,
      questionId,
      metadata: { solutionTextLength: body.solutionText?.length },
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
