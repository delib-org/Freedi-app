import { NextRequest, NextResponse } from 'next/server';
import { logError, ValidationError } from '@/lib/utils/errorHandling';
import { ERROR_MESSAGES } from '@/constants/common';

/**
 * POST /api/statements/[id]/check-similar
 * Proxy to Cloud Function for checking similar solutions
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
        { error: 'User input is required' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Get Cloud Function endpoint from environment
    const endpoint = process.env.CHECK_SIMILARITIES_ENDPOINT;

    if (!endpoint) {
      const error = new ValidationError('CHECK_SIMILARITIES_ENDPOINT not configured');
      logError(error, {
        operation: 'api.checkSimilar',
        userId,
        questionId,
      });

      return NextResponse.json(
        { error: 'Similar check service not configured' },
        { status: 500 }
      );
    }

    // Call Cloud Function
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statementId: questionId,
        userInput,
        creatorId: userId,
        generateIfNeeded: false,
      }),
    });

    // Parse response - handle non-JSON responses (e.g., gateway errors)
    let data: Record<string, unknown>;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // Non-JSON response (gateway error, timeout, etc.)
      const textResponse = await response.text();
      logError(new Error('Non-JSON response from Cloud Function'), {
        operation: 'api.checkSimilar',
        userId,
        questionId,
        metadata: {
          status: response.status,
          contentType,
          responsePreview: textResponse.substring(0, 100),
        },
      });

      return NextResponse.json(
        {
          error: 'Service temporarily unavailable',
          message: 'The similarity check service returned an unexpected response. Please try again.',
        },
        { status: 503 }
      );
    }

    // Pass through the response
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    // Ensure no caching of similarity results
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    logError(error, {
      operation: 'api.checkSimilar',
      metadata: { questionId, endpoint: process.env.CHECK_SIMILARITIES_ENDPOINT },
    });

    return NextResponse.json(
      {
        error: ERROR_MESSAGES.CHECK_SIMILAR_FAILED,
        message: error instanceof Error ? error.message : ERROR_MESSAGES.GENERIC,
      },
      { status: 500 }
    );
  }
}
