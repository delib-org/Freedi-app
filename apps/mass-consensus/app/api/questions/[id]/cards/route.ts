import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { VALIDATION } from '@/constants/common';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { buildOptionStatements, cleanOptionTexts, getCreatorForUser } from '@/lib/firebase/buildOptionStatements';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { canEditQuestionCards } from '@/lib/auth/questionCardsAccess';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logError } from '@/lib/utils/errorHandling';

/** Admin-built lists are small; this only guards against a runaway question. */
const MAX_CARDS = 500;

interface CreateCardsBody {
  texts?: unknown;
  surveyId?: unknown;
}

/**
 * POST /api/questions/[id]/cards — add option cards to an existing question,
 * for its admins. Body: { texts: string[], surveyId?: string }. The cards are
 * created in the order given, exactly as the create-question wizard does.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // An admin typing cards one by one sends one request per card
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.STANDARD);
  if (rateLimitResponse) return rateLimitResponse;

  const { id: questionId } = await params;
  let userId: string | null = null;

  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const body = (await request.json()) as CreateCardsBody;
    const surveyId = typeof body.surveyId === 'string' ? body.surveyId : null;
    if (!Array.isArray(body.texts) || !body.texts.every((text) => typeof text === 'string')) {
      return NextResponse.json({ error: 'texts must be a list of strings' }, { status: 400 });
    }

    const texts = cleanOptionTexts(body.texts as string[]);
    if (texts.length === 0) {
      return NextResponse.json({ error: 'At least one card text is required' }, { status: 400 });
    }
    if (texts.some((text) => text.length > VALIDATION.MAX_STATEMENT_LENGTH)) {
      return NextResponse.json(
        { error: `A card can hold at most ${VALIDATION.MAX_STATEMENT_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (!(await canEditQuestionCards(userId, questionId, surveyId))) {
      return NextResponse.json({ error: 'Only an admin can manage these cards' }, { status: 403 });
    }

    const db = getFirestoreAdmin();
    const questionRef = db.collection(Collections.statements).doc(questionId);
    const questionDoc = await questionRef.get();
    if (!questionDoc.exists) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const question = questionDoc.data() as Statement;
    const creator = await getCreatorForUser(userId);
    const cards = buildOptionStatements(question, texts, creator);

    const batch = db.batch();
    for (const card of cards) {
      batch.set(db.collection(Collections.statements).doc(card.statementId), card);
    }
    batch.update(questionRef, {
      numberOfOptions: FieldValue.increment(cards.length),
      lastUpdate: Date.now(),
    });
    await batch.commit();

    return NextResponse.json({ cards }, { status: 201 });
  } catch (error) {
    logError(error, {
      operation: 'api.questionCards.POST',
      userId: userId ?? undefined,
      questionId,
    });

    return NextResponse.json({ error: 'Failed to add cards' }, { status: 500 });
  }
}

/**
 * GET /api/questions/[id]/cards?surveyId= — the option cards of a question,
 * for its admins, in the order they were created (which is the order the
 * admin typed them). Hidden cards and synthesis clusters are left out.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.READ);
  if (rateLimitResponse) return rateLimitResponse;

  const { id: questionId } = await params;
  let userId: string | null = null;

  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const surveyId = request.nextUrl.searchParams.get('surveyId');
    if (!(await canEditQuestionCards(userId, questionId, surveyId))) {
      return NextResponse.json({ error: 'Only an admin can manage these cards' }, { status: 403 });
    }

    const snapshot = await getFirestoreAdmin()
      .collection(Collections.statements)
      .where('parentId', '==', questionId)
      .where('statementType', '==', StatementType.option)
      .limit(MAX_CARDS)
      .get();

    const cards = snapshot.docs
      .map((doc) => {
        // Vectors are large and of no use to the editor
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { embedding, ...card } = doc.data() as Statement & { embedding?: unknown };

        return card as Statement;
      })
      .filter((card) => !card.hide && !card.isCluster)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

    return NextResponse.json({ cards });
  } catch (error) {
    logError(error, {
      operation: 'api.questionCards.GET',
      userId: userId ?? undefined,
      questionId,
    });

    return NextResponse.json({ error: 'Failed to load cards' }, { status: 500 });
  }
}
