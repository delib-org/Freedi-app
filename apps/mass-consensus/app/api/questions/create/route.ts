import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import {
  Statement,
  StatementType,
  Collections,
  Role,
  QuestionType,
  EvaluationUI,
  ResultsBy,
  CutoffBy,
  createStatementObject,
  getRandomUID,
} from '@freedi/shared-types';
import { getFirestoreAdmin, initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { verifyToken, extractBearerToken, isAdminOfStatement } from '@/lib/auth/verifyAdmin';
import { logger } from '@/lib/utils/logger';

interface CreateQuestionRequest {
  /** The question text/title */
  statement: string;
  /** Parent group's statementId */
  parentId: string;
  /** Evaluation type: 'suggestions' | 'voting' | 'checkbox' */
  evaluationType?: 'suggestions' | 'voting' | 'checkbox';
  /** Max votes per user (for voting mode) */
  maxVotesPerUser?: number;
  /** Require solution before evaluation */
  askUserForASolutionBeforeEvaluation?: boolean;
  /** Initial solutions to create */
  solutions?: string[];
}

interface CreateQuestionResponse {
  question: Statement;
  solutions?: Statement[];
  message: string;
}

/**
 * POST /api/questions/create - Create a new question with optional initial solutions
 *
 * Creates a question statement in the main statements collection
 * along with admin subscription and optional solution statements.
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

    // Parse request body
    const body: CreateQuestionRequest = await request.json();

    // Validate required fields
    if (!body.statement || body.statement.trim().length < 3) {
      return NextResponse.json(
        { error: 'Question text must be at least 3 characters' },
        { status: 400 }
      );
    }

    if (!body.parentId) {
      return NextResponse.json(
        { error: 'Parent group ID is required' },
        { status: 400 }
      );
    }

    // Verify user is admin of the parent group
    const isAdmin = await isAdminOfStatement(userId, body.parentId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'You must be an admin of the parent group to create questions' },
        { status: 403 }
      );
    }

    // Get parent group to determine topParentId
    const db = getFirestoreAdmin();
    const parentDoc = await db.collection(Collections.statements).doc(body.parentId).get();

    if (!parentDoc.exists) {
      return NextResponse.json(
        { error: 'Parent group not found' },
        { status: 404 }
      );
    }

    const parentStatement = parentDoc.data() as Statement;

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
      logger.info('[POST /api/questions/create] Could not fetch user details, using defaults');
    }

    const now = Date.now();
    const questionId = getRandomUID();

    // Determine evaluation UI based on input
    const evaluationUI = mapEvaluationType(body.evaluationType);

    // Create the question statement
    const questionStatement = createStatementObject({
      statementId: questionId,
      statement: body.statement.trim(),
      statementType: StatementType.question,
      parentId: body.parentId,
      topParentId: parentStatement.topParentId || parentStatement.statementId,
      parents: [...(parentStatement.parents || []), body.parentId],
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
        hasChildren: false, // Mass consensus questions don't have children
      },
    });

    if (!questionStatement) {
      return NextResponse.json(
        { error: 'Failed to create question statement' },
        { status: 500 }
      );
    }

    // Add question-specific settings
    const questionWithSettings: Statement = {
      ...questionStatement,
      questionSettings: {
        questionType: QuestionType.massConsensus,
        askUserForASolutionBeforeEvaluation: body.askUserForASolutionBeforeEvaluation ?? true,
      },
      evaluationSettings: {
        evaluationUI,
        ...(body.maxVotesPerUser && evaluationUI === EvaluationUI.voting
          ? { maxVotesPerUser: body.maxVotesPerUser }
          : {}),
      },
      evaluation: {
        numberOfEvaluators: 0,
        sumEvaluations: 0,
        agreement: 0,
        averageEvaluation: 0,
        evaluationRandomNumber: Math.random(),
        viewed: 0,
      },
      results: [],
      resultsSettings: {
        resultsBy: ResultsBy.consensus,
        numberOfResults: 1,
        cutoffBy: CutoffBy.topOptions,
      },
    };

    // Create admin subscription for the question
    const subscriptionId = `${userId}--${questionId}`;
    const subscription = {
      statementsSubscribeId: subscriptionId,
      statementId: questionId,
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
        statementId: questionId,
        statement: body.statement.trim(),
        statementType: StatementType.question,
      },
      createdAt: now,
      lastUpdate: now,
      getInAppNotification: true,
      getEmailNotification: false,
      getPushNotification: false,
    };

    // Create solution statements if provided
    const solutionStatements: Statement[] = [];
    const filteredSolutions = (body.solutions || [])
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const solutionText of filteredSolutions) {
      const solutionId = getRandomUID();
      const solution = createStatementObject({
        statementId: solutionId,
        statement: solutionText,
        statementType: StatementType.option,
        parentId: questionId,
        topParentId: questionWithSettings.topParentId,
        parents: [...(questionWithSettings.parents || []), questionId],
        creatorId: userId,
        creator: {
          uid: userId,
          displayName,
          email,
          photoURL,
          isAnonymous: false,
        },
      });

      if (solution) {
        solutionStatements.push(solution);
      }
    }

    // Use batch to create all documents atomically
    const batch = db.batch();

    // Add question
    const questionRef = db.collection(Collections.statements).doc(questionId);
    batch.set(questionRef, questionWithSettings);

    // Add admin subscription
    const subscriptionRef = db.collection(Collections.statementsSubscribe).doc(subscriptionId);
    batch.set(subscriptionRef, subscription);

    // Add solutions
    for (const solution of solutionStatements) {
      const solutionRef = db.collection(Collections.statements).doc(solution.statementId);
      batch.set(solutionRef, solution);
    }

    await batch.commit();

    logger.info(
      '[POST /api/questions/create] Created question:',
      questionId,
      'with',
      solutionStatements.length,
      'solutions for user:',
      userId
    );

    const response: CreateQuestionResponse = {
      question: questionWithSettings,
      solutions: solutionStatements.length > 0 ? solutionStatements : undefined,
      message: 'Question created successfully',
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    logger.error('[POST /api/questions/create] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create question' },
      { status: 500 }
    );
  }
}

/**
 * Map evaluation type string to EvaluationUI enum
 */
function mapEvaluationType(type?: string): EvaluationUI {
  switch (type) {
    case 'voting':
      return EvaluationUI.voting;
    case 'checkbox':
      return EvaluationUI.checkbox;
    case 'suggestions':
    default:
      return EvaluationUI.suggestions;
  }
}
