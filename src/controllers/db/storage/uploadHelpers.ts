import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, auth } from '../config';
import { logError } from '@/utils/errorHandling';

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (before resizing)
export const ALLOWED_FILE_TYPES = [
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/svg+xml',
	'image/webp',
];
export const ICON_SIZE = 32; // 32x32 pixels

export interface UploadResult {
	url: string;
	path: string;
}

/**
 * Resizes an image to 32x32 pixels using canvas
 */
async function resizeImage(file: File): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();

		reader.onload = (e) => {
			const img = new Image();

			img.onload = () => {
				// Create canvas for resizing
				const canvas = document.createElement('canvas');
				const ctx = canvas.getContext('2d');

				if (!ctx) {
					reject(new Error('Failed to get canvas context'));

					return;
				}

				// Set canvas size to 32x32
				canvas.width = ICON_SIZE;
				canvas.height = ICON_SIZE;

				// Calculate aspect ratio and center the image
				const aspectRatio = img.width / img.height;
				let drawWidth = ICON_SIZE;
				let drawHeight = ICON_SIZE;
				let offsetX = 0;
				let offsetY = 0;

				if (aspectRatio > 1) {
					// Landscape image
					drawHeight = ICON_SIZE / aspectRatio;
					offsetY = (ICON_SIZE - drawHeight) / 2;
				} else if (aspectRatio < 1) {
					// Portrait image
					drawWidth = ICON_SIZE * aspectRatio;
					offsetX = (ICON_SIZE - drawWidth) / 2;
				}

				// Clear canvas with transparent background
				ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);

				// Draw resized image centered on canvas
				ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

				// Convert canvas to blob
				canvas.toBlob(
					(blob) => {
						if (blob) {
							resolve(blob);
						} else {
							reject(new Error('Failed to create blob from canvas'));
						}
					},
					'image/png',
					0.9, // Quality (0.9 = 90%)
				);
			};

			img.onerror = () => {
				reject(new Error('Failed to load image'));
			};

			img.src = e.target?.result as string;
		};

		reader.onerror = () => {
			reject(new Error('Failed to read file'));
		};

		reader.readAsDataURL(file);
	});
}

export async function uploadAnchorIcon(file: File, statementId: string): Promise<UploadResult> {
	// Check if user is authenticated
	if (!auth.currentUser) {
		throw new Error('You must be logged in to upload images');
	}

	// Validate file type
	if (!ALLOWED_FILE_TYPES.includes(file.type)) {
		throw new Error('Invalid file type. Please upload PNG, JPG, GIF, SVG, or WebP images.');
	}

	// Validate file size
	if (file.size > MAX_FILE_SIZE) {
		throw new Error('File size must be less than 5MB');
	}

	// Resize image to 32x32 pixels (skip for SVG as it's scalable)
	let uploadBlob: Blob = file;
	if (file.type !== 'image/svg+xml') {
		uploadBlob = await resizeImage(file);
	}

	// Create a unique filename - using statements path which already has permissions
	const timestamp = Date.now();
	const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.[^/.]+$/, '');
	const fileName = `statements/${statementId}/anchor_icons/${timestamp}_${sanitizedFileName}_32x32.png`;

	// Upload file to Firebase Storage
	const storageRef = ref(storage, fileName);
	const snapshot = await uploadBytes(storageRef, uploadBlob);

	// Get download URL
	const url = await getDownloadURL(snapshot.ref);

	return {
		url,
		path: fileName,
	};
}

export async function deleteAnchorIcon(path: string): Promise<void> {
	if (!path) return;

	try {
		const storageRef = ref(storage, path);
		await deleteObject(storageRef);
	} catch (error) {
		logError(error, { operation: 'storage.uploadHelpers.deleteAnchorIcon', metadata: { message: 'Error deleting anchor icon:' } });
		// Don't throw - deletion failures shouldn't break the UI
	}
}

export function validateImageFile(file: File): string | null {
	if (!ALLOWED_FILE_TYPES.includes(file.type)) {
		return 'Please upload PNG, JPG, GIF, SVG, or WebP images';
	}

	if (file.size > MAX_FILE_SIZE) {
		return `File size must be less than ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(1)}MB`;
	}

	return null;
}
