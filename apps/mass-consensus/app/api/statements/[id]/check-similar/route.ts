import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/statements/[id]/check-similar
 * Proxy to Cloud Function for checking similar solutions
 * This avoids CORS issues when calling from client
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { userInput, userId } = body;

    const questionId = params.id;

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
      console.error('CHECK_SIMILARITIES_ENDPOINT not configured');
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

    const data = await response.json();

    // Pass through the response
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] Check similar error:', error);
    return NextResponse.json(
      {
        error: 'Failed to check for similar solutions',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
