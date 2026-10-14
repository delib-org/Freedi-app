import { NextRequest, NextResponse } from 'next/server';
import { isMeaningfulSuggestion, MIN_MEANINGFUL_WORDS } from '@freedi/shared-types';
import { logError, ValidationError } from '@/lib/utils/errorHandling';
import { ERROR_MESSAGES } from '@/constants/common';
import { getAddOptionRefusal } from '@/lib/firebase/addOptionGuard';
import { postToCloudFunction } from '@/lib/api/cloudFunction';

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

    if (!isMeaningfulSuggestion(userInput)) {
      return NextResponse.json(
        { error: `Suggestion must have at least ${MIN_MEANINGFUL_WORDS} real words`, ok: false },
        { status: 400 }
      );
    }

    // "Admin options only": refuse before the AI round trip. The client treats
    // 403 as a refusal (not a fallback to the older two-call path), so it will
    // not retry through detect-multi / check-similar.
    const refusal = await getAddOptionRefusal(questionId);
    if (refusal) {
      return NextResponse.json({ ...refusal.body, ok: false }, { status: refusal.status });
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

    const result = await postToCloudFunction(endpoint, {
      questionId,
      userInput,
      userId,
      checkPieces: checkPieces === true,
    });

    if (result.kind === 'unavailable') {
      // A gateway page (cold start, function missing, timeout) rather than the function's own answer
      logError(new Error('Suggestion service returned a non-JSON page'), {
        operation: 'api.prepare',
        questionId,
        metadata: { status: result.status, attempts: result.attempts, preview: result.preview },
      });

      return NextResponse.json(
        { error: 'Suggestion service unavailable', ok: false },
        { status: 503 }
      );
    }

    return NextResponse.json(result.data, { status: result.status });
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
