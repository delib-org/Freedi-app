/**
 * API endpoint for uploading images
 * POST /api/admin/upload
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Collections } from '@freedi/shared-types';
import { getFirebaseAdmin, uploadBufferToStorage } from '@/lib/firebase/admin';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { logger } from '@/lib/utils/logger';

interface UploadResponse {
  success: boolean;
  url?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Maximum file size in bytes (5 MB)
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Allowed image MIME types
 */
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

export async function POST(request: NextRequest): Promise<NextResponse<UploadResponse>> {
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

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentId = formData.get('documentId') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided', errorCode: 'NO_FILE' },
        { status: 400 }
      );
    }

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID is required', errorCode: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG',
          errorCode: 'INVALID_TYPE',
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB`,
          errorCode: 'FILE_TOO_LARGE',
        },
        { status: 400 }
      );
    }

    // Verify user is admin of the document
    const { db } = getFirebaseAdmin();
    const docRef = db.collection(Collections.statements).doc(documentId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { success: false, error: 'Document not found', errorCode: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Check admin access
    const accessResult = await checkAdminAccess(db, documentId, userId);

    if (!accessResult.isAdmin || accessResult.isViewer) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to upload to this document', errorCode: 'UNAUTHORIZED' },
        { status: 403 }
      );
    }

    // Generate unique filename
    const extension = getExtensionFromMimeType(file.type);
    const imageId = `img_${crypto.randomUUID().slice(0, 8)}`;
    const storagePath = `documents/${documentId}/images/${imageId}${extension}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Firebase Storage
    const url = await uploadBufferToStorage(buffer, storagePath, file.type);

    logger.info(`Image uploaded: ${storagePath}`);

    return NextResponse.json({
      success: true,
      url,
    });
  } catch (error) {
    logger.error('Upload error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to upload image. Please try again.',
        errorCode: 'SERVER_ERROR',
      },
      { status: 500 }
    );
  }
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
  };

  return mimeToExt[mimeType] || '.jpg';
}
