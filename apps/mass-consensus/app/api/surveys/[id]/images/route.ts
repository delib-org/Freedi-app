import { NextRequest, NextResponse } from 'next/server';
import { requireSurveyAccess } from '@/lib/auth/surveyAccess';
import { saveSurveyImage } from '@/lib/firebase/surveyImageAdmin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logError } from '@/lib/utils/errorHandling';
import { bytesMatchType, checkCardImageFile, isCardImageType } from '@/lib/utils/cardImage';

/**
 * POST /api/surveys/[id]/images — a picture for one of the survey's own
 * pages (an explanation page's hero, a picture inside its markdown).
 *
 * multipart { file } → { url }. The survey document is not touched: the
 * editor places the URL and the survey save carries it. Only an admin who
 * can edit the survey may upload, and the bytes must match the declared
 * type before the file goes public.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.WRITE);
  if (rateLimitResponse) return rateLimitResponse;

  const { id: surveyId } = await params;
  let userId: string | undefined;

  try {
    const access = await requireSurveyAccess(request, surveyId, 'edit');
    if (!access.ok) return access.response;
    userId = access.userId;

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const problem = checkCardImageFile(file);
    if (problem || !isCardImageType(file.type)) {
      return NextResponse.json({ error: 'Unsupported image', reason: problem }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytesMatchType(bytes, file.type)) {
      return NextResponse.json({ error: 'Unsupported image', reason: 'content' }, { status: 400 });
    }

    const url = await saveSurveyImage(surveyId, bytes, file.type);

    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    logError(error, { operation: 'api.surveyImages.POST', userId, metadata: { surveyId } });

    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}
