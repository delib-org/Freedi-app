import { NextRequest, NextResponse } from 'next/server';
import { logError, ValidationError } from '@/lib/utils/errorHandling';
import { ERROR_MESSAGES, VALIDATION } from '@/constants/common';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/statements/[id]/merge
 * Merge a new suggestion into an existing statement.
 * This creates a hidden statement for the original input and merges the content.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { targetStatementId, solutionText, userId, userName } = body;

    const questionId = params.id;

    // Validate required fields
    if (!targetStatementId) {
      return NextResponse.json(
        { error: 'Target statement ID is required' },
        { status: 400 }
      );
    }

    if (!solutionText || typeof solutionText !== 'string') {
      return NextResponse.json(
        { error: 'Solution text is required' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const trimmedText = solutionText.trim();

    if (trimmedText.length < VALIDATION.MIN_SOLUTION_LENGTH) {
      return NextResponse.json(
        { error: `Solution must be at least ${VALIDATION.MIN_SOLUTION_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (trimmedText.length > VALIDATION.MAX_SOLUTION_LENGTH) {
      return NextResponse.json(
        { error: `Solution must be less than ${VALIDATION.MAX_SOLUTION_LENGTH} characters` },
        { status: 400 }
      );
    }

    // Get Cloud Function endpoint from environment
    const endpoint = process.env.MERGE_STATEMENTS_ENDPOINT;

    if (!endpoint) {
      const error = new ValidationError('MERGE_STATEMENTS_ENDPOINT not configured');
      logError(error, {
        operation: 'api.merge',
        userId,
        questionId,
        targetStatementId,
      });

      return NextResponse.json(
        { error: 'Merge service not configured' },
        { status: 500 }
      );
    }

    logger.info('[Merge] Calling Cloud Function', {
      questionId,
      targetStatementId,
      contentLength: trimmedText.length,
    });

    // Call Cloud Function
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetStatementId,
        newContent: trimmedText,
        questionId,
        userId,
        userName,
      }),
    });

    const data = await response.json();

    // Pass through the response
    if (!response.ok) {
      logger.error('[Merge] Cloud Function error', {
        status: response.status,
        error: data.error,
      });

      return NextResponse.json(data, { status: response.status });
    }

    logger.info('[Merge] Success', {
      statementId: data.statementId,
      mergedStatementId: data.mergedStatementId,
      newTitle: data.newTitle?.substring(0, 50),
    });

    return NextResponse.json({
      success: true,
      action: 'merged' as const,
      statementId: data.statementId,
      mergedStatementId: data.mergedStatementId,
      newTitle: data.newTitle,
    });
  } catch (error) {
    const body = await request.json().catch(() => ({}));
    const { userId, targetStatementId } = body;
    const questionId = params.id;

    logError(error, {
      operation: 'api.merge',
      userId,
      questionId,
      targetStatementId,
      metadata: { endpoint: process.env.MERGE_STATEMENTS_ENDPOINT },
    });

    return NextResponse.json(
      {
        error: ERROR_MESSAGES.MERGE_FAILED || 'Failed to merge statement',
        message: error instanceof Error ? error.message : ERROR_MESSAGES.GENERIC,
      },
      { status: 500 }
    );
  }
}
