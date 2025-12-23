/**
 * API endpoint for importing Google Docs into Sign app
 * POST /api/import/google-docs
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Collections } from '@freedi/shared-types';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { fetchGoogleDoc, getServiceAccountEmail } from '@/lib/google-docs/client';
import { convertGoogleDocsToParagraphs, getDocumentTitle } from '@/lib/google-docs/converter';
import { Paragraph } from '@/types';
import { logger } from '@/lib/utils/logger';

interface ImportRequest {
  documentUrl: string;
  statementId: string;
}

interface ImportResponse {
  success: boolean;
  paragraphs?: Paragraph[];
  documentTitle?: string;
  error?: string;
  errorCode?: string;
  serviceAccountEmail?: string;
}

/**
 * Extract document ID from Google Docs URL
 */
function extractDocumentId(url: string): string | null {
  const patterns = [
    /^https?:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
    /^https?:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse<ImportResponse>> {
  try {
    // Get user from cookies
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required', errorCode: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json() as ImportRequest;
    const { documentUrl, statementId } = body;

    if (!documentUrl) {
      return NextResponse.json(
        { success: false, error: 'Document URL is required', errorCode: 'INVALID_URL' },
        { status: 400 }
      );
    }

    if (!statementId) {
      return NextResponse.json(
        { success: false, error: 'Statement ID is required', errorCode: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    // Extract document ID from URL
    const googleDocId = extractDocumentId(documentUrl);
    if (!googleDocId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please enter a valid Google Docs URL (e.g., https://docs.google.com/document/d/...)',
          errorCode: 'INVALID_URL',
        },
        { status: 400 }
      );
    }

    // Verify user is admin of the document
    const { db } = getFirebaseAdmin();
    const docRef = db.collection(Collections.statements).doc(statementId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { success: false, error: 'Document not found', errorCode: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Check admin access (owner or collaborator with admin role)
    const accessResult = await checkAdminAccess(db, statementId, userId);

    if (!accessResult.isAdmin || accessResult.isViewer) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to import to this document', errorCode: 'UNAUTHORIZED' },
        { status: 403 }
      );
    }

    // Fetch Google Doc
    let googleDoc;
    try {
      googleDoc = await fetchGoogleDoc(googleDocId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check for specific Google API errors
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Document not found. Please check the URL.',
            errorCode: 'NOT_FOUND',
          },
          { status: 404 }
        );
      }

      if (errorMessage.includes('permission') || errorMessage.includes('403') || errorMessage.includes('access')) {
        const serviceEmail = getServiceAccountEmail();
        return NextResponse.json(
          {
            success: false,
            error: `Cannot access this document. Please share it with: ${serviceEmail}`,
            errorCode: 'ACCESS_DENIED',
            serviceAccountEmail: serviceEmail,
          },
          { status: 403 }
        );
      }

      logger.error('Google Docs API error:', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch document. Please try again.',
          errorCode: 'SERVER_ERROR',
        },
        { status: 500 }
      );
    }

    // Convert to paragraphs
    const paragraphs = convertGoogleDocsToParagraphs(googleDoc);
    const documentTitle = getDocumentTitle(googleDoc);

    if (paragraphs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'The document appears to be empty or has no importable content.',
          errorCode: 'CONVERSION_ERROR',
        },
        { status: 400 }
      );
    }

    // Generate description from paragraphs (first 200 chars)
    const description = paragraphs
      .map((p) => p.content)
      .join(' ')
      .slice(0, 200);

    // Save to Firestore
    await docRef.update({
      paragraphs,
      description: description.length === 200 ? description + '...' : description,
      lastUpdate: Date.now(),
    });

    return NextResponse.json({
      success: true,
      paragraphs,
      documentTitle,
    });
  } catch (error) {
    logger.error('Import error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to import document. Please try again.',
        errorCode: 'SERVER_ERROR',
      },
      { status: 500 }
    );
  }
}
