import { NextRequest, NextResponse } from 'next/server';
import { Statement, StatementType, Collections } from '@freedi/shared-types';
import { getSurveyById, addQuestionToSurvey } from '@/lib/firebase/surveys';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { AddQuestionRequest } from '@/types/survey';

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
    const now = Date.now();

    // Generate new statement ID
    const statementId = `q_${now}_${Math.random().toString(36).substring(2, 9)}`;

    // Create the question statement
    const newQuestion: Partial<Statement> = {
      statementId,
      statement: body.newQuestion.title.trim(),
      description: body.newQuestion.description?.trim(),
      statementType: StatementType.question,
      parentId: 'top',
      topParentId: statementId,
      creatorId: userId,
      createdAt: now,
      lastUpdate: now,
      consensus: 0,
      randomSeed: Math.random(),
      evaluation: {
        numberOfEvaluators: 0,
        sumEvaluations: 0,
        agreement: 0,
        averageEvaluation: 0,
      },
    };

    // Save the question to Firestore
    await db.collection(Collections.statements).doc(statementId).set(newQuestion);

    // Add to survey
    const updatedSurvey = await addQuestionToSurvey(surveyId, statementId);

    console.info('[POST /api/surveys/[id]/questions] Created question:', statementId, 'for survey:', surveyId);

    return NextResponse.json({
      question: newQuestion,
      survey: updatedSurvey,
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/surveys/[id]/questions] Error:', error);
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

    console.info('[PUT /api/surveys/[id]/questions] Added question:', body.questionId, 'to survey:', surveyId);

    return NextResponse.json({
      question,
      survey: updatedSurvey,
    });
  } catch (error) {
    console.error('[PUT /api/surveys/[id]/questions] Error:', error);
    return NextResponse.json(
      { error: 'Failed to add question' },
      { status: 500 }
    );
  }
}
