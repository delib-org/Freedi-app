import { NextRequest, NextResponse } from 'next/server';
import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { setCardImage, setCardImageAlt, removeCardImage } from '@/lib/firebase/cardImageAdmin';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { canEditCardImage } from '@/lib/auth/cardImageAccess';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logError } from '@/lib/utils/errorHandling';
import {
  bytesMatchType,
  checkCardImageFile,
  isCardImageType,
  normalizeAltText,
} from '@/lib/utils/cardImage';

/**
 * /api/statements/[id]/image — the picture on an option's swipe card.
 *
 *   GET    → { canEdit } for the caller (drives whether the button shows)
 *   POST   → multipart { file?, alt?, surveyId? }, sets imagesURL.main
 *            (without a file, only the description of the current picture)
 *   DELETE → ?surveyId=, clears it
 *
 * `surveyId` only widens who counts as an admin (see canEditCardImage).
 */

type RouteParams = { params: Promise<{ id: string }> };

type Resolved =
  | { ok: true; userId: string; option: Statement }
  | { ok: false; response: NextResponse };

function fail(error: string, status: number): Resolved {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

async function resolveCaller(request: NextRequest, statementId: string): Promise<Resolved> {
  const token = extractBearerToken(request.headers.get('Authorization'));
  if (!token) return fail('Authorization required', 401);

  const userId = await verifyToken(token);
  if (!userId) return fail('Invalid or expired token', 401);

  const doc = await getFirestoreAdmin().collection(Collections.statements).doc(statementId).get();
  if (!doc.exists) return fail('Statement not found', 404);

  const option = doc.data() as Statement;
  if (option.statementType !== StatementType.option) {
    return fail('Only option cards can have an image', 400);
  }

  return { ok: true, userId, option };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const caller = await resolveCaller(request, id);
    if (!caller.ok) {
      // Anyone who cannot be resolved simply cannot edit; the card still renders.
      return NextResponse.json({ canEdit: false });
    }

    const surveyId = request.nextUrl.searchParams.get('surveyId');
    const canEdit = await canEditCardImage(caller.userId, caller.option, surveyId);

    return NextResponse.json({ canEdit });
  } catch (error) {
    logError(error, { operation: 'api.statementImage.GET', statementId: id });

    return NextResponse.json({ canEdit: false });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.WRITE);
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await params;
  let userId: string | undefined;

  try {
    const caller = await resolveCaller(request, id);
    if (!caller.ok) return caller.response;
    userId = caller.userId;

    const formData = await request.formData();
    const file = formData.get('file');
    const surveyIdField = formData.get('surveyId');
    const surveyId = typeof surveyIdField === 'string' ? surveyIdField : null;

    if (!(await canEditCardImage(caller.userId, caller.option, surveyId))) {
      return NextResponse.json({ error: 'Only an admin can change a card image' }, { status: 403 });
    }

    const alt = normalizeAltText(formData.get('alt'));

    // No new file: only the description of the picture already there changes
    if (!(file instanceof File)) {
      if (!caller.option.imagesURL?.main) {
        return NextResponse.json({ error: 'File is required' }, { status: 400 });
      }
      const imagesURL = await setCardImageAlt(caller.option, alt);

      return NextResponse.json({ imagesURL });
    }

    const problem = checkCardImageFile(file);
    if (problem || !isCardImageType(file.type)) {
      return NextResponse.json({ error: 'Unsupported image', reason: problem }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytesMatchType(bytes, file.type)) {
      return NextResponse.json({ error: 'Unsupported image', reason: 'content' }, { status: 400 });
    }

    const imagesURL = await setCardImage(caller.option, bytes, file.type, alt);

    return NextResponse.json({ imagesURL }, { status: 201 });
  } catch (error) {
    logError(error, { operation: 'api.statementImage.POST', userId, statementId: id });

    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.WRITE);
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await params;
  let userId: string | undefined;

  try {
    const caller = await resolveCaller(request, id);
    if (!caller.ok) return caller.response;
    userId = caller.userId;

    const surveyId = request.nextUrl.searchParams.get('surveyId');
    if (!(await canEditCardImage(caller.userId, caller.option, surveyId))) {
      return NextResponse.json({ error: 'Only an admin can change a card image' }, { status: 403 });
    }

    const imagesURL = await removeCardImage(caller.option);

    return NextResponse.json({ imagesURL });
  } catch (error) {
    logError(error, { operation: 'api.statementImage.DELETE', userId, statementId: id });

    return NextResponse.json({ error: 'Failed to remove image' }, { status: 500 });
  }
}
