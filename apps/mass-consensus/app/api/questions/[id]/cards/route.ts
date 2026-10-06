import { NextRequest, NextResponse } from 'next/server';
import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { canEditQuestionCards } from '@/lib/auth/questionCardsAccess';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logError } from '@/lib/utils/errorHandling';

/** Admin-built lists are small; this only guards against a runaway question. */
const MAX_CARDS = 500;

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
