import { getStorageAdmin } from './admin';
import { CardImageType, buildCardImageUrl } from '../utils/cardImage';
import { buildSurveyImagePath } from '../utils/surveyImage';

/**
 * Upload a picture for one of a survey's own pages and return the URL a
 * browser can load. Nothing is written to Firestore here: the editor puts
 * the URL where it belongs (a hero field, a markdown image) and the survey
 * save carries it.
 */
export async function saveSurveyImage(
  surveyId: string,
  bytes: Buffer,
  type: CardImageType
): Promise<string> {
  const bucket = getStorageAdmin().bucket();
  const storagePath = buildSurveyImagePath(surveyId, type, Date.now());
  const file = bucket.file(storagePath);

  await file.save(bytes, { contentType: type, metadata: { contentType: type } });

  const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || undefined;
  // The emulator serves every object to the REST path already.
  if (!emulatorHost) {
    await file.makePublic();
  }

  return buildCardImageUrl(bucket.name, storagePath, emulatorHost);
}
