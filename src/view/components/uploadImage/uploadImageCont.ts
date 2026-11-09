import { compressImage } from './compressImage';
import { uploadImageToStorage } from '@/controllers/db/images/setImages';
import { updateStatementMainImage } from '@/controllers/db/statements/setStatements';
import { Statement } from '@freedi/shared-types';
import React from 'react';
import { logError } from '@/utils/errorHandling';
import { IMAGE_UPLOAD } from '@/constants/common';

export async function setImageLocally(
	file: File,
	statement: Statement,
	setImage: React.Dispatch<React.SetStateAction<string>>,
	setProgress: React.Dispatch<React.SetStateAction<number>>,
	onError?: () => void,
	previousImage: string = '',
): Promise<void> {
	if (!file) return;

	let previewURL: string | undefined;

	try {
		// Step 1: shrink + compress (0-50% progress)
		const compressedFile = await compressImage(
			file,
			IMAGE_UPLOAD.TARGET_SIZE_KB,
			(compressionProgress: number) => {
				setProgress(compressionProgress / 2);
			},
		);

		// Show compressed image preview
		previewURL = URL.createObjectURL(compressedFile);
		setImage(previewURL);

		// Step 2: Upload to Firebase (50-100% progress)
		const imageURL = await uploadImageToStorage(compressedFile, statement, (uploadProgress) => {
			setProgress(50 + uploadProgress / 2);
		});

		// Step 3: Update database and show final image
		await updateStatementMainImage(statement, imageURL);
		setImage(imageURL);
		setProgress(100);
	} catch (error) {
		logError(error, {
			operation: 'uploadImage.uploadImageCont.setImageLocally',
			statementId: statement.statementId,
			metadata: { fileType: file.type, fileSize: file.size },
		});
		setProgress(0);
		// The preview blob is about to be revoked; do not leave a dead URL on screen.
		setImage(previousImage);
		onError?.();
	} finally {
		const url = previewURL;
		if (url) {
			// Delay so the final image has time to load before the blob goes
			setTimeout(() => URL.revokeObjectURL(url), IMAGE_UPLOAD.PREVIEW_REVOKE_DELAY_MS);
		}
	}
}
