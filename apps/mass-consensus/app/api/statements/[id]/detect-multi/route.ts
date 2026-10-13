import { NextRequest, NextResponse } from 'next/server';
import { logError, ValidationError } from '@/lib/utils/errorHandling';
import { ERROR_MESSAGES } from '@/constants/common';
import { postToCloudFunction } from '@/lib/api/cloudFunction';

/**
 * POST /api/statements/[id]/detect-multi
 * Proxy to Cloud Function for detecting multiple suggestions
 * This avoids CORS issues when calling from client
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: questionId } = await params;

  try {
    const body = await request.json();
    const { userInput, userId } = body;

    // Validate input
    if (!userInput || typeof userInput !== 'string') {
      return NextResponse.json(
        { error: 'User input is required', ok: false, isMultipleSuggestions: false, suggestions: [] },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required', ok: false, isMultipleSuggestions: false, suggestions: [] },
        { status: 400 }
      );
    }

    // Get Cloud Function endpoint from environment
    // Use the same base URL as CHECK_SIMILARITIES_ENDPOINT but with different function name
    const similarEndpoint = process.env.CHECK_SIMILARITIES_ENDPOINT;

    if (!similarEndpoint) {
      const error = new ValidationError('CHECK_SIMILARITIES_ENDPOINT not configured');
      logError(error, {
        operation: 'api.detectMulti',
        userId,
        questionId,
      });

      return NextResponse.json(
        { error: 'Multi-suggestion detection service not configured', ok: false, isMultipleSuggestions: false, suggestions: [] },
        { status: 500 }
      );
    }

    // Build the endpoint by replacing the function name
    // e.g., https://region-project.cloudfunctions.net/findSimilarStatements
    // becomes https://region-project.cloudfunctions.net/detectMultipleSuggestions
    const endpoint = similarEndpoint
      .replace('findSimilarStatements', 'detectMultipleSuggestions')
      .replace('checkForSimilarStatements', 'detectMultipleSuggestions'); // Legacy fallback

    // Call Cloud Function
    const result = await postToCloudFunction(endpoint, {
      userInput,
      questionId,
      userId,
    });

    if (result.kind === 'unavailable') {
      logError(new Error('Multi-suggestion service returned a non-JSON page'), {
        operation: 'api.detectMulti',
        questionId,
        metadata: { status: result.status, attempts: result.attempts, preview: result.preview },
      });

      return NextResponse.json(
        { error: ERROR_MESSAGES.GENERIC, ok: false, isMultipleSuggestions: false, suggestions: [] },
        { status: 503 }
      );
    }

    // Pass through the response
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    logError(error, {
      operation: 'api.detectMulti',
      questionId,
      metadata: { endpoint: process.env.CHECK_SIMILARITIES_ENDPOINT },
    });

    return NextResponse.json(
      {
        error: ERROR_MESSAGES.GENERIC,
        ok: false,
        isMultipleSuggestions: false,
        suggestions: [],
        message: error instanceof Error ? error.message : ERROR_MESSAGES.GENERIC,
      },
      { status: 500 }
    );
  }
}
