import { NextRequest, NextResponse } from 'next/server';
import { searchQuestions } from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { logger } from '@/lib/utils/logger';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /api/questions - Fetch user's available questions from main Freedi app
 *
 * Query params:
 * - search: text to search for in question statement
 * - limit: max number of results (default 20, max 100)
 * - cursor: pagination cursor (statementId of last item)
 *
 * Returns questions that the user can add to surveys:
 * 1. Questions created by this user
 * 2. Questions where user has admin role (via statementsSubscribe)
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));

    if (!token) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const userId = await verifyToken(token);

    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const searchQuery = searchParams.get('search') || '';
    const limit = Math.min(
      parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10),
      MAX_LIMIT
    );
    const cursor = searchParams.get('cursor') || undefined;

    const result = await searchQuestions(userId, {
      search: searchQuery,
      limit,
      cursor,
    });

    console.info(
      '[GET /api/questions] Found',
      result.questions.length,
      'questions for user:',
      userId,
      searchQuery ? `(search: "${searchQuery}")` : ''
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error('[GET /api/questions] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch questions' },
      { status: 500 }
    );
  }
}
