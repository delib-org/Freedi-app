import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import {
  Statement,
  StatementType,
  Collections,
  Role,
  Access,
  createStatementObject,
  getRandomUID,
} from '@freedi/shared-types';
import { getFirestoreAdmin, initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/groups - Fetch groups where user is admin
 *
 * Returns groups that the user can create questions in:
 * 1. Groups created by this user
 * 2. Groups where user has admin role (via statementsSubscribe)
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

    const db = getFirestoreAdmin();

    // Get all statement IDs where user has admin role
    const subscriptionsSnapshot = await db
      .collection(Collections.statementsSubscribe)
      .where('userId', '==', userId)
      .where('role', '==', Role.admin)
      .get();

    if (subscriptionsSnapshot.empty) {
      logger.info('[GET /api/groups] No admin subscriptions found for user:', userId);
      return NextResponse.json({ groups: [], total: 0 });
    }

    const statementIds = subscriptionsSnapshot.docs.map(
      (doc) => doc.data().statementId as string
    );

    // Fetch the statements in batches (Firestore 'in' query limit is 30)
    const groups: Statement[] = [];
    const batchSize = 30;

    for (let i = 0; i < statementIds.length; i += batchSize) {
      const batch = statementIds.slice(i, i + batchSize);

      // Fetch statements that are either groups or top-level statements
      const statementsSnapshot = await db
        .collection(Collections.statements)
        .where('statementId', 'in', batch)
        .get();

      for (const doc of statementsSnapshot.docs) {
        const statement = doc.data() as Statement;
        // Include if it's a group type OR if it's a top-level statement (parentId === 'top')
        if (
          statement.statementType === StatementType.group ||
          statement.parentId === 'top'
        ) {
          groups.push(statement);
        }
      }
    }

    // Sort by creation date descending (newest first)
    groups.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    logger.info('[GET /api/groups] Found', groups.length, 'groups for user:', userId);

    return NextResponse.json({
      groups,
      total: groups.length,
    });
  } catch (error) {
    logger.error('[GET /api/groups] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch groups' },
      { status: 500 }
    );
  }
}

interface CreateGroupRequest {
  title: string;
  description?: string;
}

/**
 * POST /api/groups - Create a new top-level group
 *
 * Creates a group in the main statements collection with the user as admin.
 * This is used when admin doesn't have any existing groups.
 */
export async function POST(request: NextRequest) {
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

    // Get user info from Firebase Auth
    initializeFirebaseAdmin();
    const auth = getAuth();
    let displayName = 'Admin';
    let email = '';
    let photoURL = '';

    try {
      const userRecord = await auth.getUser(userId);
      displayName = userRecord.displayName || userRecord.email?.split('@')[0] || 'Admin';
      email = userRecord.email || '';
      photoURL = userRecord.photoURL || '';
    } catch {
      logger.info('[POST /api/groups] Could not fetch user details, using defaults');
    }

    // Parse request body
    const body: CreateGroupRequest = await request.json();

    if (!body.title || body.title.trim().length < 3) {
      return NextResponse.json(
        { error: 'Group title must be at least 3 characters' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();
    const statementId = getRandomUID();
    const now = Date.now();

    // Create the group statement
    const groupStatement = createStatementObject({
      statementId,
      statement: body.title.trim(),
      statementType: StatementType.group,
      parentId: 'top',
      topParentId: statementId, // Self-referential for top-level groups
      creatorId: userId,
      creator: {
        uid: userId,
        displayName,
        email,
        photoURL,
        isAnonymous: false,
      },
      statementSettings: {
        showEvaluation: true,
        enableAddEvaluationOption: true,
        enableAddVotingOption: true,
        hasChat: true,
        hasChildren: true,
      },
    });

    if (!groupStatement) {
      return NextResponse.json(
        { error: 'Failed to create group statement' },
        { status: 500 }
      );
    }

    // Add membership with open access
    const groupWithMembership = {
      ...groupStatement,
      membership: { access: Access.openToAll },
    };

    // Create admin subscription
    const subscriptionId = `${userId}--${statementId}`;
    const subscription = {
      statementsSubscribeId: subscriptionId,
      statementId,
      userId,
      role: Role.admin,
      user: {
        uid: userId,
        displayName,
        email,
        photoURL,
        isAnonymous: false,
      },
      statement: {
        statementId,
        statement: body.title.trim(),
        statementType: StatementType.group,
      },
      createdAt: now,
      lastUpdate: now,
      getInAppNotification: true,
      getEmailNotification: false,
      getPushNotification: false,
    };

    // Use batch to create both documents atomically
    const batch = db.batch();

    const statementRef = db.collection(Collections.statements).doc(statementId);
    batch.set(statementRef, groupWithMembership);

    const subscriptionRef = db.collection(Collections.statementsSubscribe).doc(subscriptionId);
    batch.set(subscriptionRef, subscription);

    await batch.commit();

    logger.info('[POST /api/groups] Created group:', statementId, 'for user:', userId);

    return NextResponse.json(
      {
        group: groupWithMembership,
        message: 'Group created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('[POST /api/groups] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create group' },
      { status: 500 }
    );
  }
}
