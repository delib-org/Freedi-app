import { NextRequest, NextResponse } from 'next/server';
import { fetchSuggestionCandidates } from '@/lib/firebase/surveys/suggestionCandidates';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/questions/suggested?parentIds=a,b - Candidate questions for the
 * survey picker's "Suggested" section: siblings of the given parents' children
 * and the parents themselves, limited to what the user can access.
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const parentIds = (request.nextUrl.searchParams.get('parentIds') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const questions = await fetchSuggestionCandidates(userId, parentIds);

    return NextResponse.json({ questions });
  } catch (error) {
    logger.error('[GET /api/questions/suggested] Error:', error);

    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 });
  }
}
