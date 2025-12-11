import { NextRequest, NextResponse } from 'next/server';
import { getAvailableQuestions } from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';

/**
 * GET /api/questions - Fetch user's available questions from main Freedi app
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

    const questions = await getAvailableQuestions(userId);

    console.info('[GET /api/questions] Found', questions.length, 'questions for admin:', userId);

    return NextResponse.json({
      questions,
      total: questions.length,
    });
  } catch (error) {
    console.error('[GET /api/questions] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch questions' },
      { status: 500 }
    );
  }
}
