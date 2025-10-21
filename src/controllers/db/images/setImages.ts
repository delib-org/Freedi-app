import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../config';
import { Statement, Collections } from 'delib-npm';

export function uploadImageToStorage(
	file: File,
	statement: Statement,
	onProgress?: (progress: number) => void
): Promise<string> {
	return new Promise((resolve, reject) => {
		// Use the statement's ID for the image path
		// This ensures the user can upload to their own statement
		const imageRef = ref(
			storage,
			`${Collections.statements}/${statement.statementId
			}/imgId-${Math.random()}`
		);

		const uploadTask = uploadBytesResumable(imageRef, file);

		uploadTask.on(
			'state_changed',
			(snapshot) => {
				const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
				onProgress?.(progress);
				
				switch (snapshot.state) {
					case 'paused':
						console.info('Upload is paused');
						break;
					case 'running':
						console.info('Upload is running');
						break;
				}
			},
			(error) => {
				console.error(error);
				reject(error);
			},
			async () => {
				try {
					onProgress?.(100);
					const downloadURL = await getDownloadURL(
						uploadTask.snapshot.ref
					);
					resolve(downloadURL);
				} catch (error) {
					console.error('Error retrieving download URL:', error);
					reject(error);
				}
			}
		);
	});
}
