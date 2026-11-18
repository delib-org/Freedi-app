import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import {
	THUMB,
	firebaseDownloadUrl,
	mainPointsAt,
	parseThumbSource,
	thumbPathFor,
} from './thumbnailPaths';

export type ThumbOutcome =
	| 'skipped' // not a statement main image
	| 'too-small' // the image is already no bigger than a thumb
	| 'attached' // thumb written and recorded on the statement
	| 'not-current'; // the statement no longer (or never) points at this image

export interface MakeThumbnailOptions {
	/**
	 * Uploads finish before the client writes imagesURL.main, so a trigger can
	 * arrive first. Re-check this many times before giving up.
	 */
	attachRetries: number;
	retryDelayMs: number;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Orientation 5-8 store the picture rotated by 90°: width and height swap. */
function displayedWidth(meta: sharp.Metadata): number {
	const width = meta.width ?? 0;
	const height = meta.height ?? 0;

	return (meta.orientation ?? 1) >= 5 ? height : width;
}

/**
 * Make a small WebP copy of a statement's main image and record it on the
 * statement, so cards stop downloading the full photo.
 */
export async function makeThumbnail(
	objectName: string,
	{ attachRetries, retryDelayMs }: MakeThumbnailOptions,
): Promise<ThumbOutcome> {
	const source = parseThumbSource(objectName);
	if (!source) return 'skipped';

	const bucket = getStorage().bucket();
	const [bytes] = await bucket.file(objectName).download();
	const mainWidth = displayedWidth(await sharp(bytes).metadata());

	const { data, info } = await sharp(bytes)
		.rotate() // apply EXIF orientation before resizing
		.resize({
			width: THUMB.MAX_DIMENSION_PX,
			height: THUMB.MAX_DIMENSION_PX,
			fit: 'inside',
			withoutEnlargement: true,
		})
		.webp({ quality: THUMB.WEBP_QUALITY })
		.toBuffer({ resolveWithObject: true });

	if (!mainWidth || info.width >= mainWidth) return 'too-small';

	const thumbPath = thumbPathFor(source);
	const token = randomUUID();
	await bucket.file(thumbPath).save(data, {
		contentType: 'image/webp',
		metadata: {
			cacheControl: THUMB.CACHE_CONTROL,
			metadata: { firebaseStorageDownloadTokens: token },
		},
	});
	const thumbUrl = firebaseDownloadUrl(bucket.name, thumbPath, token);

	const statementRef = getFirestore().collection(Collections.statements).doc(source.statementId);

	for (let attempt = 0; attempt <= attachRetries; attempt++) {
		const attached = await getFirestore().runTransaction(async (tx) => {
			const snap = await tx.get(statementRef);
			const main: string | undefined = snap.get('imagesURL.main');
			if (!snap.exists || !mainPointsAt(main, objectName)) return false;
			tx.update(statementRef, {
				'imagesURL.thumb': thumbUrl,
				'imagesURL.thumbOf': main,
				'imagesURL.thumbWidth': info.width,
				'imagesURL.mainWidth': mainWidth,
			});

			return true;
		});

		if (attached) {
			await removeOtherThumbs(source.statementId, thumbPath);

			return 'attached';
		}
		if (attempt < attachRetries) await delay(retryDelayMs);
	}

	await bucket.file(thumbPath).delete({ ignoreNotFound: true });

	return 'not-current';
}

/** Thumbs of pictures this statement has replaced. */
async function removeOtherThumbs(statementId: string, keepPath: string): Promise<void> {
	try {
		const bucket = getStorage().bucket();
		const [files] = await bucket.getFiles({ prefix: `statements/${statementId}/${THUMB.FOLDER}/` });
		await Promise.all(
			files
				.filter((file) => file.name !== keepPath)
				.map((file) => file.delete({ ignoreNotFound: true })),
		);
	} catch (error) {
		// Leftover thumbs only cost storage; never fail the new thumb over them.
		logError(error, {
			operation: 'images.makeThumbnail.removeOtherThumbs',
			statementId,
		});
	}
}
