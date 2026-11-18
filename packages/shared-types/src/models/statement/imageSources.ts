import type { Statement } from './StatementTypes';

type ImagesURL = Statement['imagesURL'];

export interface ImageSources {
	/** The full image, or the copy when it is the same size but lighter. */
	src: string;
	/** Small and full copy with their widths; absent when there is no valid thumb. */
	srcSet?: string;
}

/**
 * What an <img> showing a statement's main image should load. The thumb is
 * used only while it was made from the current main: after a replace it
 * belongs to the old picture until fn_imageThumbnail writes a new one.
 * Returns undefined when the statement has no image.
 */
export function getImageSources(imagesURL: ImagesURL): ImageSources | undefined {
	const main = imagesURL?.main;
	if (!main) return undefined;

	const { thumb, thumbOf, thumbWidth, mainWidth } = imagesURL;
	const thumbIsCurrent = !!thumb && thumbOf === main && !!thumbWidth && !!mainWidth;
	if (!thumbIsCurrent) return { src: main };

	// Same size, lighter file (e.g. a PNG screenshot re-encoded as WebP): just use it.
	if (thumbWidth >= mainWidth) return { src: thumb };

	return { src: main, srcSet: `${thumb} ${thumbWidth}w, ${main} ${mainWidth}w` };
}
