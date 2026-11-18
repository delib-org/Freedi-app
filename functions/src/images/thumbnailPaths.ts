/**
 * Pure rules for statement-image thumbnails, shared by the storage trigger
 * and the backfill script.
 *
 * Main-app uploads: statements/{statementId}/imgId-{random}
 * MC card images:   statements/{statementId}/card-{time}-{id}.{ext}
 * Thumbnails:       statements/{statementId}/thumbs/{fileName}.webp
 */

export const THUMB = {
	/** Longest side. Cards show the image at up to ~200 CSS px, so this covers 3× screens. */
	MAX_DIMENSION_PX: 640,
	WEBP_QUALITY: 75,
	FOLDER: 'thumbs',
	CACHE_CONTROL: 'public, max-age=31536000, immutable',
	/** A copy no narrower than the original is kept only below this share of its bytes. */
	MAX_SAME_SIZE_BYTES_RATIO: 0.8,
} as const;

/**
 * Whether the WebP copy is worth keeping: narrower than the original, or the
 * same size but much lighter (a 476px PNG screenshot is ~290 KB; as WebP ~19 KB).
 */
export function thumbIsWorthIt(
	thumb: { width: number; bytes: number },
	main: { width: number; bytes: number },
): boolean {
	if (!main.width || !main.bytes) return false;
	if (thumb.width < main.width) return true;

	return thumb.bytes <= main.bytes * THUMB.MAX_SAME_SIZE_BYTES_RATIO;
}

const SOURCE_PATTERN = /^statements\/([^/]+)\/((?:imgId-|card-)[^/]+)$/;

export interface ThumbSource {
	statementId: string;
	fileName: string;
}

/** The statement and file name of an uploaded main image, or null for anything else (thumbs included). */
export function parseThumbSource(objectName: string | undefined): ThumbSource | null {
	if (!objectName) return null;
	const match = SOURCE_PATTERN.exec(objectName);
	if (!match) return null;

	return { statementId: match[1], fileName: match[2] };
}

export function thumbPathFor({ statementId, fileName }: ThumbSource): string {
	return `statements/${statementId}/${THUMB.FOLDER}/${fileName}.webp`;
}

/**
 * Whether a statement's main URL points at this storage object. Firebase
 * download URLs carry the path encoded; public GCS URLs carry it raw.
 */
export function mainPointsAt(mainUrl: string | undefined, objectName: string): boolean {
	if (!mainUrl) return false;
	let decoded = mainUrl;
	try {
		decoded = decodeURIComponent(mainUrl);
	} catch {
		// a malformed URL is compared as it is
	}

	return decoded.includes(objectName);
}

/** The storage object a main URL points at, if it is in our bucket. */
export function objectNameFromUrl(url: string, bucketName: string): string | null {
	const firebaseMarker = `/b/${bucketName}/o/`;
	const firebaseIndex = url.indexOf(firebaseMarker);
	if (firebaseIndex >= 0) {
		const encoded = url.slice(firebaseIndex + firebaseMarker.length).split('?')[0];
		try {
			return decodeURIComponent(encoded);
		} catch {
			return null;
		}
	}
	const gcsMarker = `storage.googleapis.com/${bucketName}/`;
	const gcsIndex = url.indexOf(gcsMarker);
	if (gcsIndex >= 0) return url.slice(gcsIndex + gcsMarker.length).split('?')[0];

	return null;
}

export function firebaseDownloadUrl(bucketName: string, objectName: string, token: string): string {
	return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectName)}?alt=media&token=${token}`;
}
