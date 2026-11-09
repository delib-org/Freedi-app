import React from 'react';
import { IMAGE_UPLOAD } from '@/constants/common';
import { ValidationError } from '@/utils/errorHandling';
import { calculateTargetSize } from './imageDimensions';

interface DecodedImage {
	source: CanvasImageSource;
	width: number;
	height: number;
	release: () => void;
}

/**
 * Decode a file for drawing. createImageBitmap with imageOrientation
 * 'from-image' applies the EXIF rotation; the <img> fallback is rotated
 * by every current browser when drawn to a canvas.
 */
async function decodeImage(file: File): Promise<DecodedImage> {
	if (typeof createImageBitmap === 'function') {
		try {
			const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

			return {
				source: bitmap,
				width: bitmap.width,
				height: bitmap.height,
				release: () => bitmap.close(),
			};
		} catch {
			// fall through to the <img> path
		}
	}

	const url = URL.createObjectURL(file);

	try {
		const img = new Image();
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new ValidationError('Image could not be decoded'));
			img.src = url;
		});

		return {
			source: img,
			width: img.naturalWidth,
			height: img.naturalHeight,
			release: () => {
				img.src = '';
				URL.revokeObjectURL(url);
			},
		};
	} catch (error) {
		URL.revokeObjectURL(url);
		throw error;
	}
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Shrink a photo: longest side capped at IMAGE_UPLOAD.MAX_DIMENSION_PX, then
 * re-encoded until it is under maxSizeKB. If the target cannot be reached the
 * smallest result is returned as long as it is under the storage limit.
 * Rejects with ValidationError if the file cannot be decoded or stays too big.
 */
export const compressImage = async (
	file: File,
	maxSizeKB: number,
	setProgress: React.Dispatch<React.SetStateAction<number>>,
): Promise<File> => {
	const decoded = await decodeImage(file);
	const canvas = document.createElement('canvas');

	try {
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new ValidationError('Could not get canvas context');
		}

		let { width, height } = calculateTargetSize(
			decoded.width,
			decoded.height,
			IMAGE_UPLOAD.MAX_DIMENSION_PX,
		);
		let quality: number = IMAGE_UPLOAD.INITIAL_QUALITY;
		let best: Blob | null = null;

		for (let tries = 0; tries <= IMAGE_UPLOAD.MAX_TRIES; tries++) {
			canvas.width = Math.max(1, Math.round(width));
			canvas.height = Math.max(1, Math.round(height));
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

			const blob = await encode(canvas, file.type, quality);
			if (!blob) {
				throw new ValidationError('Image could not be encoded', { type: file.type });
			}

			if (!best || blob.size < best.size) best = blob;
			setProgress(Math.min(((tries + 1) / (IMAGE_UPLOAD.MAX_TRIES + 1)) * 100, 99));

			if (blob.size / IMAGE_UPLOAD.BYTES_PER_KB <= maxSizeKB) break;

			quality = Math.max(IMAGE_UPLOAD.MIN_QUALITY, quality - IMAGE_UPLOAD.QUALITY_STEP);
			width *= IMAGE_UPLOAD.DIMENSION_SHRINK_FACTOR;
			height *= IMAGE_UPLOAD.DIMENSION_SHRINK_FACTOR;
		}

		if (!best || best.size >= IMAGE_UPLOAD.STORAGE_LIMIT_BYTES) {
			throw new ValidationError('Image is too large to upload after compression', {
				bytes: best?.size,
				limit: IMAGE_UPLOAD.STORAGE_LIMIT_BYTES,
			});
		}

		setProgress(100);

		// blob.type is what the canvas really produced (PNG when the original
		// type, e.g. HEIC or GIF, cannot be encoded), so use it, not file.type.
		return new File([best], file.name, { type: best.type || file.type });
	} finally {
		decoded.release();
		canvas.width = 0;
		canvas.height = 0;
	}
};
