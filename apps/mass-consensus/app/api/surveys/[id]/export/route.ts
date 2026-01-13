import { NextRequest, NextResponse } from 'next/server';
import { getSurveyExportData, getSurveyById } from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/surveys/[id]/export
 * Export complete survey data as JSON
 *
 * Query params:
 * - includeTestData: boolean - If true, includes test data in export (default: false)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: surveyId } = await params;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const includeTestData = searchParams.get('includeTestData') === 'true';

    // Extract and verify token
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Verify user owns this survey
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    if (survey.creatorId !== userId) {
      return NextResponse.json({ error: 'You can only export your own surveys' }, { status: 403 });
    }

    logger.info('[GET /api/surveys/[id]/export] Exporting survey:', surveyId, 'includeTestData:', includeTestData);

    const exportData = await getSurveyExportData(surveyId, { includeTestData });

    if (!exportData) {
      return NextResponse.json({ error: 'Failed to generate export data' }, { status: 500 });
    }

    // Return JSON with appropriate headers for download
    const filename = `survey-${surveyId}-${Date.now()}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error('[GET /api/surveys/[id]/export] Error:', error);
    return NextResponse.json(
      { error: 'Failed to export survey data' },
      { status: 500 }
    );
  }
}
