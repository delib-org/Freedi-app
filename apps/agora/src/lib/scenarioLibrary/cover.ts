import { uploadTopicAsset } from '../teacher';
import { COVER_MAX_SIDE, COVER_QUALITY, fitWithin } from './coverRules';

/**
 * A library cover: any jpeg / png / webp up to 5 MB, shrunk in the browser to
 * 1600 px on the long side and stored as webp under the scenario's own folder
 * (`agora/{scenarioId}/…`, the one the storage rules already allow images in).
 * Never a URL field: the teacher drops or picks a picture.
 */

async function shrink(file: File): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	const { width, height } = fitWithin(bitmap.width, bitmap.height, COVER_MAX_SIDE);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('No canvas context');
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the cover'))),
			'image/webp',
			COVER_QUALITY,
		);
	});
}

/** Shrink and upload; resolves with the download URL the publish callable wants */
export async function uploadCover(
	scenarioId: string,
	file: File,
	onProgress: (percent: number) => void,
): Promise<string> {
	const blob = await shrink(file);
	const stored = new File([blob], 'library-cover.webp', { type: 'image/webp' });

	return uploadTopicAsset(scenarioId, `library-cover-${Date.now()}.webp`, stored, onProgress);
}
