import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from './client';
import type { SurveyLogo } from '@freedi/shared-types';

/**
 * Maximum file size: 5MB
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Allowed image types
 */
const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
];

/**
 * Generate unique logo ID
 */
function generateLogoId(): string {
  return `logo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Validate uploaded file
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
 * Upload a logo to Firebase Storage
 */
export async function uploadSurveyLogo(
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

  // Create storage reference
  const storageRef = ref(storage, storagePath);

  // Upload file
  await uploadBytes(storageRef, file);

  // Get public URL
  const publicUrl = await getDownloadURL(storageRef);

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
 * Delete a logo from Firebase Storage
 */
export async function deleteSurveyLogo(
  storageUrl: string
): Promise<void> {
  const storageRef = ref(storage, storageUrl);
  await deleteObject(storageRef);
}

/**
 * Update logo metadata (only updates what's provided)
 */
export function updateLogoMetadata(
  logo: SurveyLogo,
  updates: {
    altText?: string;
    order?: number;
    width?: number;
    height?: number;
  }
): SurveyLogo {
  return {
    ...logo,
    ...(updates.altText !== undefined && { altText: updates.altText }),
    ...(updates.order !== undefined && { order: updates.order }),
    ...(updates.width !== undefined && { width: updates.width }),
    ...(updates.height !== undefined && { height: updates.height }),
  };
}
