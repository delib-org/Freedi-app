import { getStorageAdmin } from './admin';
import type { SurveyLogo } from '@freedi/shared-types';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];

/**
 * Generate unique logo ID
 */
function generateLogoId(): string {
  return `logo_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Validate logo file (server-side)
 */
export function validateLogoFile(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(
      `Invalid file type: ${file.type}. Allowed types: PNG, JPG, SVG, WebP`
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size: 5MB`
    );
  }
}

/**
 * Generate storage path for survey logo
 */
export function generateStoragePath(surveyId: string, filename: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 9);
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `surveys/${surveyId}/logos/${timestamp}-${randomId}-${sanitizedFilename}`;
}

/**
 * Upload a logo to Firebase Storage using Admin SDK (server-side)
 */
export async function uploadSurveyLogoAdmin(
  surveyId: string,
  file: File,
  altText: string,
  order: number
): Promise<SurveyLogo> {
  // Validate file
  validateLogoFile(file);

  // Generate unique ID and path
  const logoId = generateLogoId();
  const storagePath = generateStoragePath(surveyId, file.name);

  // Get Storage instance
  const storage = getStorageAdmin();
  const bucket = storage.bucket();

  // Convert File to Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Upload file to Storage
  const fileRef = bucket.file(storagePath);
  await fileRef.save(buffer, {
    contentType: file.type,
    metadata: {
      contentType: file.type,
    },
  });

  // Make file publicly readable
  await fileRef.makePublic();

  // Get public URL
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

  // Create logo object
  const logo: SurveyLogo = {
    logoId,
    storageUrl: storagePath,
    publicUrl,
    altText,
    order,
    uploadedAt: Date.now(),
  };

  return logo;
}

/**
 * Delete a logo from Firebase Storage using Admin SDK (server-side)
 */
export async function deleteSurveyLogoAdmin(storageUrl: string): Promise<void> {
  const storage = getStorageAdmin();
  const bucket = storage.bucket();
  const fileRef = bucket.file(storageUrl);

  try {
    await fileRef.delete();
  } catch (error) {
    // Ignore if file doesn't exist
    if (error instanceof Error && !error.message.includes('No such object')) {
      throw error;
    }
  }
}
