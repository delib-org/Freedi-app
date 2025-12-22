import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Collections } from '@freedi/shared-types';
import { deleteDemographicQuestion, saveDemographicQuestion } from '@/lib/firebase/demographicQueries';
import { DemographicMode, CreateQuestionRequest } from '@/types/demographics';
import { logger } from '@/lib/utils/logger';

/**
 * PUT /api/demographics/questions/[docId]/[questionId]
 * Update an existing demographic question (admin only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string; questionId: string }> }
): Promise<NextResponse> {
  try {
    const { docId, questionId } = await params;
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

    // Check admin access (owner or collaborator with admin role)
    const accessResult = await checkAdminAccess(db, docId, userId);

    if (!accessResult.isAdmin || accessResult.isViewer) {
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
        { error: 'Cannot update questions when not in custom mode' },
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

    // Update the question
    const updatedQuestion = await saveDemographicQuestion(docId, topParentId, {
      userQuestionId: questionId,
      question: body.question,
      type: body.type,
      options: body.options || [],
      required: body.required,
      order: body.order,
    });

    console.info(`[API] Question ${questionId} updated for document ${docId} by user ${userId}`);

    return NextResponse.json({
      success: true,
      question: updatedQuestion,
    });
  } catch (error) {
    logger.error('[API] Demographics question PUT failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/demographics/questions/[docId]/[questionId]
 * Delete a demographic question (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string; questionId: string }> }
): Promise<NextResponse> {
  try {
    const { docId, questionId } = await params;
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

    // Check admin access (owner or collaborator with admin role)
    const accessResult = await checkAdminAccess(db, docId, userId);

    if (!accessResult.isAdmin || accessResult.isViewer) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Verify the question exists and belongs to this document
    const questionRef = db.collection(Collections.userDemographicQuestions).doc(questionId);
    const questionSnap = await questionRef.get();

    if (!questionSnap.exists) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }

    const questionData = questionSnap.data();
    if (questionData?.statementId !== docId || questionData?.scope !== 'sign') {
      return NextResponse.json(
        { error: 'Cannot delete this question' },
        { status: 403 }
      );
    }

    // Delete the question
    await deleteDemographicQuestion(questionId);

    console.info(`[API] Question ${questionId} deleted for document ${docId} by user ${userId}`);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error('[API] Demographics question DELETE failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
