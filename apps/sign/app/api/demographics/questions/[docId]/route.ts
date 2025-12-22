import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Collections } from '@freedi/shared-types';
import {
  getDemographicQuestions,
  saveDemographicQuestion,
  getAllQuestionsForDocument,
} from '@/lib/firebase/demographicQueries';
import {
  DemographicMode,
  CreateQuestionRequest,
  DemographicQuestionsResponse,
} from '@/types/demographics';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/demographics/questions/[docId]
 * Returns demographic questions for a document based on mode
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
  try {
    const { docId } = await params;
    // userId is available via getUserIdFromCookie(request.headers.get('cookie')) if needed

    const { db } = getFirebaseAdmin();

    // Get the document to check settings
    const docRef = db.collection(Collections.statements).doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const document = docSnap.data();
    const topParentId = document?.topParentId || docId;
    const signSettings = document?.signSettings || {};

    const mode: DemographicMode = signSettings.demographicMode || 'disabled';
    const required = signSettings.demographicRequired || false;

    // Get questions based on mode
    const questions = await getDemographicQuestions(docId, mode, topParentId);

    const response: DemographicQuestionsResponse = {
      questions,
      mode,
      required,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('[API] Demographics questions GET failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/demographics/questions/[docId]
 * Create a new demographic question (admin only, custom mode)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
  try {
    const { docId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { db } = getFirebaseAdmin();

    // Get the document to verify admin
    const docRef = db.collection(Collections.statements).doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Check admin access (owner or collaborator)
    const accessResult = await checkAdminAccess(db, docId, userId);

    if (!accessResult.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const document = docSnap.data();

    // Check that document is in custom mode
    const mode: DemographicMode = document?.signSettings?.demographicMode || 'disabled';
    if (mode !== 'custom') {
      return NextResponse.json(
        { error: 'Cannot create questions when not in custom mode' },
        { status: 400 }
      );
    }

    // Parse request body
    const body: CreateQuestionRequest = await request.json();

    if (!body.question || !body.type) {
      return NextResponse.json(
        { error: 'Question text and type are required' },
        { status: 400 }
      );
    }

    const topParentId = document?.topParentId || docId;

    // Get current question count for ordering
    const existingQuestions = await getAllQuestionsForDocument(docId, topParentId);
    const signQuestions = existingQuestions.filter((q) => !q.isInherited);
    const order = body.order ?? signQuestions.length;

    // Save the question
    const savedQuestion = await saveDemographicQuestion(docId, topParentId, {
      question: body.question,
      type: body.type,
      options: body.options || [],
      required: body.required,
      order,
    });

    console.info(`[API] Question created for document ${docId} by user ${userId}`);

    return NextResponse.json({
      success: true,
      question: savedQuestion,
    });
  } catch (error) {
    logger.error('[API] Demographics questions POST failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
