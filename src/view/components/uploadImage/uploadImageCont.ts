import { compressImage } from './compressImage';
import { uploadImageToStorage } from '@/controllers/db/images/setImages';
import { updateStatementMainImage } from '@/controllers/db/statements/setStatements';
import { Statement } from '@freedi/shared-types';
import React from 'react';

export async function setImageLocally(
	file: File,
	statement: Statement,
	setImage: React.Dispatch<React.SetStateAction<string>>,
	setProgress: React.Dispatch<React.SetStateAction<number>>,
) {
	if (file) {
		const img = new Image();
		const reader = new FileReader();

		reader.onloadend = () => {
			if (reader.result) {
				img.src = reader.result as string;

				img.onload = async () => {
					try {
						// Step 1: Compress image (0-50% progress)
						const compressedFile = await compressImage(file, 200, (compressionProgress: number) => {
							setProgress(compressionProgress / 2); // 0-50%
						});

						// Show compressed image preview
						const previewURL = URL.createObjectURL(compressedFile);
						setImage(previewURL);

						// Step 2: Upload to Firebase (50-100% progress)
						const imageURL = await uploadImageToStorage(
							compressedFile,
							statement,
							(uploadProgress: number) => {
								setProgress(50 + uploadProgress / 2); // 50-100%
							},
						);

						// Step 3: Update database and show final image
						console.info('Firebase image URL:', imageURL);
						await updateStatementMainImage(statement, imageURL);
						setImage(imageURL);
						setProgress(100);

						// Clean up blob URL after a delay to ensure image loads
						setTimeout(() => {
							URL.revokeObjectURL(previewURL);
						}, 1000);
					} catch (error) {
						console.error('Error uploading image:', error);
						setProgress(0);
					}
				};
			}
		};

		reader.readAsDataURL(file);
	}
}
