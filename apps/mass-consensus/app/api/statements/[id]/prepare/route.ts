import { NextRequest, NextResponse } from 'next/server';
import { logError, ValidationError } from '@/lib/utils/errorHandling';
import { ERROR_MESSAGES } from '@/constants/common';

/**
 * POST /api/statements/[id]/prepare
 * One round trip for the "Add your idea" flow: proxies to the
 * `prepareSuggestion` Cloud Function, which moderates, detects several
 * answers in one submission, and finds similar suggestions in parallel.
 *
 * The client falls back to the older detect-multi + check-similar pair when
 * this returns 404/5xx, so the function can be deployed before or after the app.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: questionId } = await params;

  try {
    const body = await request.json();
    const { userInput, userId, checkPieces } = body;

    if (!userInput || typeof userInput !== 'string') {
      return NextResponse.json({ error: 'User input is required', ok: false }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required', ok: false }, { status: 400 });
    }

    // Same host as the similarity function; only the function name differs.
    const similarEndpoint = process.env.CHECK_SIMILARITIES_ENDPOINT;
    const endpoint =
      process.env.PREPARE_SUGGESTION_ENDPOINT ||
      similarEndpoint
        ?.replace('findSimilarStatements', 'prepareSuggestion')
        .replace('checkForSimilarStatements', 'prepareSuggestion');

    if (!endpoint) {
      logError(new ValidationError('CHECK_SIMILARITIES_ENDPOINT not configured'), {
        operation: 'api.prepare',
        userId,
        questionId,
      });

      return NextResponse.json(
        { error: 'Suggestion service not configured', ok: false },
        { status: 500 }
      );
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId,
        userInput,
        userId,
        checkPieces: checkPieces === true,
      }),
      cache: 'no-store',
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      // A gateway page (function missing, timeout) rather than the function's own answer
      return NextResponse.json(
        { error: 'Suggestion service unavailable', ok: false },
        { status: 503 }
      );
    }

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logError(error, {
      operation: 'api.prepare',
      questionId,
      metadata: { endpoint: process.env.CHECK_SIMILARITIES_ENDPOINT },
    });

    return NextResponse.json(
      {
        error: ERROR_MESSAGES.GENERIC,
        ok: false,
        message: error instanceof Error ? error.message : ERROR_MESSAGES.GENERIC,
      },
      { status: 500 }
    );
  }
}
