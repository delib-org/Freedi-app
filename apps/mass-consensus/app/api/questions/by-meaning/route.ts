import { NextRequest, NextResponse } from 'next/server';
import { QUESTION_SEARCH_CONFIG } from '@freedi/shared-types';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import {
  getMeaningSearchEndpoint,
  callSearchQuestionsByMeaning,
  loadMatchedQuestions,
} from '@/lib/firebase/surveys/questionMeaningSearch';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/questions/by-meaning { query } - the picker's "Similar by meaning".
 * Verifies the admin, calls the searchQuestionsByMeaning callable server-side
 * (no browser CORS allow-list) and returns the matched questions, best first.
 */
export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const body: { query?: unknown } = await request.json();
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (
      query.length < QUESTION_SEARCH_CONFIG.MIN_QUERY_LENGTH ||
      query.length > QUESTION_SEARCH_CONFIG.MAX_QUERY_LENGTH
    ) {
      return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
    }

    const endpoint = getMeaningSearchEndpoint();
    if (!endpoint) {
      return NextResponse.json({ error: 'Meaning search not configured' }, { status: 500 });
    }

    const { results } = await callSearchQuestionsByMeaning(endpoint, token, { query });
    const questions = await loadMatchedQuestions(results);

    return NextResponse.json({ questions });
  } catch (error) {
    logger.error('[POST /api/questions/by-meaning] Error:', error);

    return NextResponse.json({ error: 'Failed to search questions' }, { status: 500 });
  }
}
