import React, { useState, useEffect } from 'react';
import styles from './UploadImage.module.scss';
import { setImageLocally } from './uploadImageCont';
import { Statement } from 'delib-npm';

interface Props {
	readonly statement: Statement | undefined;
	readonly fileInputRef?: React.RefObject<HTMLInputElement> | null;
	readonly image: string;
	readonly setImage: React.Dispatch<React.SetStateAction<string>>;
}

export default function UploadImage({
	statement,
	fileInputRef,
	image,
	setImage,
}: Props) {
	const [isDragging, setIsDragging] = useState(false);
	const [progress, setProgress] = useState(0);
	const [showSuccess, setShowSuccess] = useState(false);

	// Reset progress and show success message after upload completes
	useEffect(() => {
		if (progress === 100) {
			setShowSuccess(true);
			const timer = setTimeout(() => {
				setProgress(0);
				setShowSuccess(false);
			}, 3000); // Hide success message after 3 seconds
			
			return () => clearTimeout(timer);
		}
	}, [progress]);

	const handleFileChange = async (
		event: React.ChangeEvent<HTMLInputElement>
	) => {
		try {
			if (!statement) throw new Error('statement is undefined');

			const file = event.target.files?.[0];
			if (file) {
				await setImageLocally(file, statement, setImage, setProgress);
			}
		} catch (error) {
			console.error(error);
		}
	};

	const handleDragEnter = () => setIsDragging(true);
	const handleDragLeave = () => setIsDragging(false);

	const handleDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
		event.preventDefault();
		setIsDragging(false);

		try {
			if (!statement) throw new Error('statement is undefined');

			const file = event.dataTransfer.files[0];

			await setImageLocally(file, statement, setImage, setProgress);
		} catch (error) {
			console.error(error);
		}
	};

	return (
		<label
			className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
			style={{ border: image === '' ? '2px dashed #ccc' : 'none' }}
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDragOver={(e) => e.preventDefault()}
			onDrop={handleDrop}
		>
			<input
				ref={fileInputRef}
				type='file'
				accept='image/*'
				onChange={handleFileChange}
				className={styles.fileInput}
			/>

			{image !== '' && (
				<div className={styles.imageContainer}>
					<div
						style={{
							backgroundImage: `url(${image})`,
						}}
						className={styles.imagePreview}
					/>
					{showSuccess && (
						<div className={styles.successOverlay}>
							<p>Upload complete! ✓</p>
						</div>
					)}
				</div>
			)}

			{!image && progress === 0 && (
				<p>Drag and drop an image here or click to upload</p>
			)}

			{progress > 0 && progress < 50 && !image && (
				<div className={styles.progressContainer}>
					<p>Compressing: {(progress * 2).toFixed(0)}%</p>
					<div className={styles.progressBar}>
						<div 
							className={styles.progressFill}
							style={{ width: `${progress * 2}%` }}
						/>
					</div>
				</div>
			)}

			{progress >= 50 && progress < 100 && (
				<div className={styles.progressContainer}>
					<p>Uploading: {((progress - 50) * 2).toFixed(0)}%</p>
					<div className={styles.progressBar}>
						<div 
							className={styles.progressFill}
							style={{ width: `${(progress - 50) * 2}%` }}
						/>
					</div>
				</div>
			)}
		</label>
	);
}
