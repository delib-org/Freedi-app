import { NextRequest, NextResponse } from 'next/server';
import { searchQuestions, getAllAccessibleQuestions } from '@/lib/firebase/surveys';
import { fetchAccessibleQuestionsByIds } from '@/lib/firebase/surveys/suggestionCandidates';
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

    // ids=a,b: just those questions (if accessible), for the "Recently removed" section
    const idsParam = searchParams.get('ids');
    if (idsParam) {
      const ids = idsParam.split(',').map((id) => id.trim()).filter(Boolean);
      const questions = await fetchAccessibleQuestionsByIds(userId, ids);

      return NextResponse.json({ questions });
    }

    // scope=all: the whole accessible set, fetched once so the picker can search locally
    if (searchParams.get('scope') === 'all') {
      const questions = await getAllAccessibleQuestions(userId);

      return NextResponse.json({ questions });
    }

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
