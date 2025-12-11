import { NextRequest, NextResponse } from 'next/server';
import { getSurveyStats } from '@/lib/firebase/surveys';
import { verifyAdmin, extractBearerToken } from '@/lib/auth/verifyAdmin';

/**
 * GET /api/surveys/[id]/stats
 * Get survey statistics (response count, completion count, completion rate)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;

    // Extract and verify admin access
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const adminResult = await verifyAdmin(token);
    if (!adminResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stats = await getSurveyStats(surveyId);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('[GET /api/surveys/[id]/stats] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch survey stats' },
      { status: 500 }
    );
  }
}
