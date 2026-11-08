import { CARD_IMAGE } from '@/constants/common';

export type CardImageType = (typeof CARD_IMAGE.ALLOWED_TYPES)[number];

/** Why a file was refused — the route turns these into 400s. */
export type CardImageProblem = 'type' | 'size' | 'empty' | 'content';

const EXTENSIONS: Record<CardImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function isCardImageType(type: string): type is CardImageType {
  return (CARD_IMAGE.ALLOWED_TYPES as readonly string[]).includes(type);
}

/** Checks the declared type and size, before the bytes are read. */
export function checkCardImageFile(file: { type: string; size: number }): CardImageProblem | null {
  if (!isCardImageType(file.type)) return 'type';
  if (file.size === 0) return 'empty';
  if (file.size > CARD_IMAGE.MAX_BYTES) return 'size';

  return null;
}

/**
 * The declared type comes from the browser and can say anything. The first
 * bytes cannot, so a file only goes public when they agree with it.
 */
export function bytesMatchType(bytes: Uint8Array, type: CardImageType): boolean {
  const startsWith = (signature: number[], offset = 0): boolean =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, i) => bytes[offset + i] === byte);

  switch (type) {
    case 'image/png':
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return startsWith([0xff, 0xd8, 0xff]);
    case 'image/gif':
      return startsWith([0x47, 0x49, 0x46, 0x38]);
    case 'image/webp':
      return startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8);
  }
}

/** Trimmed, capped, and undefined when there is nothing to say. */
export function normalizeAltText(alt: unknown): string | undefined {
  if (typeof alt !== 'string') return undefined;
  const trimmed = alt.trim().slice(0, CARD_IMAGE.ALT_MAX_LENGTH);

  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Where an option's image lives. Inside statements/{statementId}/ so the
 * existing storage rule covers it, with a fresh name per upload so a replaced
 * picture is never served from a stale cache.
 */
export function buildCardImagePath(statementId: string, type: CardImageType, now: number): string {
  const randomId = Math.random().toString(36).substring(2, 9);

  return `statements/${statementId}/card-${now}-${randomId}.${EXTENSIONS[type]}`;
}

/**
 * The URL a browser can load. The emulator serves objects through the
 * Firebase REST path, production through the public GCS host.
 */
export function buildCardImageUrl(
  bucketName: string,
  storagePath: string,
  emulatorHost: string | undefined
): string {
  if (emulatorHost) {
    return `http://${emulatorHost}/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media`;
  }

  return `https://storage.googleapis.com/${bucketName}/${storagePath}`;
}

/** Inverse of buildCardImageUrl, for deleting the object behind a URL we wrote. */
export function storagePathFromCardImageUrl(url: string, bucketName: string): string | null {
  const gcsPrefix = `https://storage.googleapis.com/${bucketName}/`;
  if (url.startsWith(gcsPrefix)) {
    return decodeURIComponent(url.slice(gcsPrefix.length).split('?')[0]);
  }

  const match = url.match(/\/v0\/b\/[^/]+\/o\/([^?]+)/);
  if (match) return decodeURIComponent(match[1]);

  return null;
}
