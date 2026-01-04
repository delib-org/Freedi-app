/**
 * API route to get document paragraphs
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDocumentForSigning, getParagraphsFromStatement } from '@/lib/firebase/queries';
import { logError } from '@/lib/utils/errorHandling';

interface RouteParams {
  params: Promise<{ statementId: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { statementId } = await params;

    if (!statementId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    // Get the document
    const document = await getDocumentForSigning(statementId);

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Get paragraphs from the document
    const paragraphs = getParagraphsFromStatement(document);

    return NextResponse.json({
      success: true,
      paragraphs,
      documentTitle: document.statement,
    });
  } catch (error) {
    const { statementId } = await params;
    logError(error, {
      operation: 'api.documents.get',
      documentId: statementId,
    });

    return NextResponse.json(
      { error: 'Failed to fetch document' },
      { status: 500 }
    );
  }
}
