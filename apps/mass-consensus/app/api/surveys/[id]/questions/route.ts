import { NextRequest, NextResponse } from 'next/server';
import { Statement, StatementType, Collections, createStatementObject, SourceApp } from '@freedi/shared-types';
import type { User } from '@freedi/shared-types';
import { replaceAllParagraphChildren } from '@freedi/shared-utils';
import { getSurveyById, addQuestionToSurvey } from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { makeMcParagraphDeps } from '@/lib/firebase/paragraphStore';
import { AddQuestionRequest } from '@/types/survey';
import { logger } from '@/lib/utils/logger';

interface RouteContext {
  params: { id: string };
}

/**
 * POST /api/surveys/[id]/questions - Create a new question and add to survey
 */
export async function POST(request: NextRequest, context: RouteContext) {
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

    const surveyId = context.params.id;
    const survey = await getSurveyById(surveyId);

    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (survey.creatorId !== userId) {
      return NextResponse.json(
        { error: 'You can only modify your own surveys' },
        { status: 403 }
      );
    }

    const body: AddQuestionRequest = await request.json();

    if (!body.newQuestion?.title) {
      return NextResponse.json(
        { error: 'Question title is required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // Generate new statement ID
    const statementId = `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const creator: User = {
      uid: userId,
      displayName: 'Survey Admin',
      email: '',
      photoURL: '',
      isAnonymous: false,
    };

    // Create the question statement using shared utility. The rich body is
    // written as canonical paragraph child statements below (not the deprecated
    // embedded `paragraphs[]` array).
    const newQuestion = createStatementObject({
      statementId,
      statement: body.newQuestion.title.trim(),
      statementType: StatementType.question,
      parentId: 'top',
      topParentId: statementId, // Top-level question is its own topParent
      creatorId: userId,
      creator,
      sourceApp: SourceApp.MASS_CONSENSUS,
    });

    if (!newQuestion) {
      return NextResponse.json(
        { error: 'Failed to create question' },
        { status: 500 }
      );
    }

    // Save the question to Firestore
    await db.collection(Collections.statements).doc(statementId).set(newQuestion);

    // Write the description as canonical paragraph child statements (one per
    // non-empty line). The `description` preview is then kept in sync by the
    // `fn_syncParagraphChildrenToDescription` Firestore trigger.
    const bodyLines = (body.newQuestion.description?.trim() || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((content) => ({ content }));

    if (bodyLines.length > 0) {
      await replaceAllParagraphChildren(makeMcParagraphDeps(creator), {
        host: { statementId, topParentId: statementId },
        lines: bodyLines,
        existing: [],
      });
    }

    // Add to survey
    const updatedSurvey = await addQuestionToSurvey(surveyId, statementId);

    logger.info('[POST /api/surveys/[id]/questions] Created question:', statementId, 'for survey:', surveyId);

    return NextResponse.json({
      question: newQuestion,
      survey: updatedSurvey,
    }, { status: 201 });
  } catch (error) {
    logger.error('[POST /api/surveys/[id]/questions] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create question' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/surveys/[id]/questions - Add existing question to survey
 */
export async function PUT(request: NextRequest, context: RouteContext) {
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

    const surveyId = context.params.id;
    const survey = await getSurveyById(surveyId);

    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (survey.creatorId !== userId) {
      return NextResponse.json(
        { error: 'You can only modify your own surveys' },
        { status: 403 }
      );
    }

    const body: AddQuestionRequest = await request.json();

    if (!body.questionId) {
      return NextResponse.json(
        { error: 'Question ID is required' },
        { status: 400 }
      );
    }

    // Verify the question exists
    const db = getFirestoreAdmin();
    const questionDoc = await db.collection(Collections.statements).doc(body.questionId).get();

    if (!questionDoc.exists) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }

    const question = questionDoc.data() as Statement;

    if (question.statementType !== StatementType.question) {
      return NextResponse.json(
        { error: 'Statement is not a question' },
        { status: 400 }
      );
    }

    // Add to survey
    const updatedSurvey = await addQuestionToSurvey(surveyId, body.questionId);

    logger.info('[PUT /api/surveys/[id]/questions] Added question:', body.questionId, 'to survey:', surveyId);

    return NextResponse.json({
      question,
      survey: updatedSurvey,
    });
  } catch (error) {
    logger.error('[PUT /api/surveys/[id]/questions] Error:', error);
    return NextResponse.json(
      { error: 'Failed to add question' },
      { status: 500 }
    );
  }
}
