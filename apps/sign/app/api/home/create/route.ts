import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie, getUserEmailFromCookie } from '@/lib/utils/user';
import { Collections, StatementType, Access, Role, ResultsBy, CutoffBy } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

interface CreateGroupBody {
  action: 'createGroup';
  title: string;
}

interface CreateDocumentBody {
  action: 'createDocument';
  title: string;
  groupId: string;
  description?: string;
}

type RequestBody = CreateGroupBody | CreateDocumentBody;

/**
 * Build a full Statement object compatible with the main Freedi app.
 * The main app expects many fields (membership, evaluation, settings, etc.)
 * to be present for documents to appear in its home feed.
 */
function buildStatementData({
  statementId,
  title,
  statementType,
  parentId,
  topParentId,
  parents,
  userId,
  displayName,
  email,
  now,
  description,
  isDocument = false,
}: {
  statementId: string;
  title: string;
  statementType: StatementType;
  parentId: string;
  topParentId: string;
  parents: string[];
  userId: string;
  displayName: string;
  email: string;
  now: number;
  description?: string;
  isDocument?: boolean;
}) {
  return {
    statementId,
    statement: title,
    ...(description && { description }),
    paragraphs: [],
    statementType,
    parentId,
    topParentId,
    parents,
    creatorId: userId,
    creator: {
      displayName,
      uid: userId,
      ...(email && { email }),
    },
    createdAt: now,
    lastUpdate: now,
    consensus: 0,
    color: getRandomColor(),
    randomSeed: Math.random(),
    membership: {
      access: Access.openToAll,
    },
    statementSettings: {
      enhancedEvaluation: true,
      hasChat: true,
      showEvaluation: true,
      enableAddEvaluationOption: true,
      enableAddVotingOption: true,
      hasChildren: true,
      enableNavigationalElements: false,
    },
    resultsSettings: {
      resultsBy: ResultsBy.consensus,
      numberOfResults: 1,
      cutoffNumber: 0,
      cutoffBy: CutoffBy.topOptions,
    },
    evaluation: {
      numberOfEvaluators: 0,
      sumEvaluations: 0,
      agreement: 0,
      averageEvaluation: 0,
      evaluationRandomNumber: Math.random(),
      viewed: 0,
    },
    hasChildren: true,
    results: [],
    isDocument,
  };
}

/**
 * Create a statementsSubscribe record so the main app can find this document
 * in the user's home feed. The subscription ID format is `{userId}--{statementId}`.
 */
async function createSubscription(
  db: FirebaseFirestore.Firestore,
  statementData: Record<string, unknown>,
  userId: string,
  displayName: string,
  email: string,
  now: number,
) {
  const statementId = statementData.statementId as string;
  const subscriptionId = `${userId}--${statementId}`;

  const subscriptionData = {
    role: Role.admin,
    userId,
    statementId,
    lastUpdate: now,
    createdAt: now,
    statementsSubscribeId: subscriptionId,
    statement: statementData,
    user: {
      displayName,
      uid: userId,
      ...(email && { email }),
    },
  };

  await db
    .collection(Collections.statementsSubscribe)
    .doc(subscriptionId)
    .set(subscriptionData, { merge: true });
}

export async function POST(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const displayName = getUserDisplayNameFromCookie(cookieHeader) || 'Anonymous';
    const email = getUserEmailFromCookie(cookieHeader) || '';
    const body = (await request.json()) as RequestBody;

    if (!body.action || !body.title || body.title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    const { db } = getFirebaseAdmin();
    const now = Date.now();
    const statementId = crypto.randomUUID();

    if (body.action === 'createGroup') {
      const groupData = buildStatementData({
        statementId,
        title: body.title.trim(),
        statementType: StatementType.group,
        parentId: 'top',
        topParentId: statementId,
        parents: ['top'],
        userId,
        displayName,
        email,
        now,
      });

      await db.collection(Collections.statements).doc(statementId).set(groupData);

      // Create subscription so it appears in the main app
      await createSubscription(db, groupData, userId, displayName, email, now);

      return NextResponse.json({ statementId });
    }

    if (body.action === 'createDocument') {
      const { groupId, description } = body as CreateDocumentBody;

      if (!groupId) {
        return NextResponse.json(
          { error: 'Group ID is required' },
          { status: 400 }
        );
      }

      // Verify the group exists and belongs to the user
      const groupDoc = await db
        .collection(Collections.statements)
        .doc(groupId)
        .get();

      if (!groupDoc.exists) {
        return NextResponse.json(
          { error: 'Group not found' },
          { status: 404 }
        );
      }

      const existingGroupData = groupDoc.data();
      if (existingGroupData?.creatorId !== userId) {
        return NextResponse.json(
          { error: 'You do not own this group' },
          { status: 403 }
        );
      }

      // Create Group -> Question -> Option (isDocument) hierarchy
      const questionId = crypto.randomUUID();
      const optionId = crypto.randomUUID();

      const questionData = buildStatementData({
        statementId: questionId,
        title: body.title.trim(),
        statementType: StatementType.question,
        parentId: groupId,
        topParentId: groupId,
        parents: ['top', groupId],
        userId,
        displayName,
        email,
        now,
      });

      const optionData = buildStatementData({
        statementId: optionId,
        title: body.title.trim(),
        statementType: StatementType.option,
        parentId: questionId,
        topParentId: groupId,
        parents: ['top', groupId, questionId],
        userId,
        displayName,
        email,
        now,
        description: description?.trim(),
        isDocument: true,
      });

      // Batch write for atomicity
      const batch = db.batch();
      batch.set(db.collection(Collections.statements).doc(questionId), questionData);
      batch.set(db.collection(Collections.statements).doc(optionId), optionData);
      await batch.commit();

      // Create subscriptions so they appear in the main app
      await Promise.all([
        createSubscription(db, questionData, userId, displayName, email, now),
        createSubscription(db, optionData, userId, displayName, email, now),
      ]);

      // Return the option's ID — the actual document for editing
      return NextResponse.json({ statementId: optionId });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    logError(error, { operation: 'api.home.create' });

    return NextResponse.json(
      { error: 'Failed to create' },
      { status: 500 }
    );
  }
}

/** Pick a random color from the same palette the main app uses */
function getRandomColor(): string {
  const colors = [
    '#e8c547', '#92d194', '#6bb0c4', '#d48ed0',
    '#f09c5a', '#68d3c8', '#c4a5e0', '#f08080',
    '#87ceeb', '#dda0dd', '#98fb98', '#ffb347',
  ];

  return colors[Math.floor(Math.random() * colors.length)];
}
