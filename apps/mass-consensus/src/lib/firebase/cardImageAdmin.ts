import { Collections, Statement } from '@freedi/shared-types';
import { getFirestoreAdmin, getStorageAdmin } from './admin';
import { logError } from '../utils/errorHandling';
import {
  CardImageType,
  buildCardImagePath,
  buildCardImageUrl,
  storagePathFromCardImageUrl,
} from '../utils/cardImage';

type ImagesURL = NonNullable<Statement['imagesURL']>;

function storageEmulatorHost(): string | undefined {
  return process.env.FIREBASE_STORAGE_EMULATOR_HOST || undefined;
}

/**
 * Remove the object behind an image URL — but only one of this option's own
 * files. A URL pointing anywhere else (another statement's folder, an
 * external host) is left alone.
 */
async function deleteOwnImage(statementId: string, url: string | undefined): Promise<void> {
  if (!url) return;

  const bucket = getStorageAdmin().bucket();
  const path = storagePathFromCardImageUrl(url, bucket.name);
  if (!path || !path.startsWith(`statements/${statementId}/`)) return;

  try {
    await bucket.file(path).delete({ ignoreNotFound: true });
  } catch (error) {
    // The document no longer points at it; an orphaned file is not worth failing over.
    logError(error, {
      operation: 'cardImageAdmin.deleteOwnImage',
      statementId,
      metadata: { path },
    });
  }
}

/**
 * Upload a picture for an option's card and point `imagesURL.main` at it.
 * The previous picture, if it was one of ours, is deleted afterwards.
 */
export async function setCardImage(
  option: Statement,
  bytes: Buffer,
  type: CardImageType,
  alt: string | undefined
): Promise<ImagesURL> {
  const bucket = getStorageAdmin().bucket();
  const storagePath = buildCardImagePath(option.statementId, type, Date.now());
  const file = bucket.file(storagePath);

  await file.save(bytes, { contentType: type, metadata: { contentType: type } });

  const emulatorHost = storageEmulatorHost();
  // The emulator serves every object to the REST path already.
  if (!emulatorHost) {
    await file.makePublic();
  }

  const imagesURL: ImagesURL = {
    ...option.imagesURL,
    main: buildCardImageUrl(bucket.name, storagePath, emulatorHost),
  };
  if (alt) {
    imagesURL.alt = alt;
  } else {
    delete imagesURL.alt;
  }

  await getFirestoreAdmin()
    .collection(Collections.statements)
    .doc(option.statementId)
    .update({ imagesURL, lastUpdate: Date.now() });

  await deleteOwnImage(option.statementId, option.imagesURL?.main);

  return imagesURL;
}

/** Change only the description of the picture already on the card. */
export async function setCardImageAlt(option: Statement, alt: string | undefined): Promise<ImagesURL> {
  const imagesURL: ImagesURL = { ...option.imagesURL };
  if (alt) {
    imagesURL.alt = alt;
  } else {
    delete imagesURL.alt;
  }

  await getFirestoreAdmin()
    .collection(Collections.statements)
    .doc(option.statementId)
    .update({ imagesURL, lastUpdate: Date.now() });

  return imagesURL;
}

/** Take the picture off an option's card. */
export async function removeCardImage(option: Statement): Promise<ImagesURL> {
  const imagesURL: ImagesURL = { ...option.imagesURL };
  delete imagesURL.main;
  delete imagesURL.alt;

  await getFirestoreAdmin()
    .collection(Collections.statements)
    .doc(option.statementId)
    .update({ imagesURL, lastUpdate: Date.now() });

  await deleteOwnImage(option.statementId, option.imagesURL?.main);

  return imagesURL;
}
