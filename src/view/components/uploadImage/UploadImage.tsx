import React, { useState, useEffect } from 'react';
import styles from './UploadImage.module.scss';
import { setImageLocally } from './uploadImageCont';
import { Statement } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

type SizeVariant = 'default' | 'compact' | 'inline';

interface Props {
	readonly statement: Statement | undefined;
	readonly fileInputRef?: React.RefObject<HTMLInputElement> | null;
	readonly image: string;
	readonly setImage: React.Dispatch<React.SetStateAction<string>>;
	readonly isAdmin?: boolean;
	readonly variant?: SizeVariant;
}

export default function UploadImage({
	statement,
	fileInputRef,
	image,
	setImage,
	isAdmin = true, // Default to true for backwards compatibility
	variant = 'default', // Default variant
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

	const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		try {
			if (!statement) throw new Error('statement is undefined');
			if (!isAdmin) {
				logError(new Error('Unauthorized: Only admins can upload images'), { operation: 'uploadImage.UploadImage.handleFileChange' });

				return;
			}

			const file = event.target.files?.[0];
			if (file) {
				await setImageLocally(file, statement, setImage, setProgress);
			}
		} catch (error) {
			logError(error, { operation: 'uploadImage.UploadImage.handleFileChange' });
		}
	};

	const handleDragEnter = () => setIsDragging(true);
	const handleDragLeave = () => setIsDragging(false);

	const handleDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
		event.preventDefault();
		setIsDragging(false);

		try {
			if (!statement) throw new Error('statement is undefined');
			if (!isAdmin) {
				logError(new Error('Unauthorized: Only admins can upload images'), { operation: 'uploadImage.UploadImage.handleDrop' });

				return;
			}

			const file = event.dataTransfer.files[0];

			await setImageLocally(file, statement, setImage, setProgress);
		} catch (error) {
			logError(error, { operation: 'uploadImage.UploadImage.handleDrop' });
		}
	};

	const variantClass =
		variant === 'inline' ? styles.inline : variant === 'compact' ? styles.compact : '';

	return (
		<label
			className={`${styles.dropZone} ${variantClass} ${isDragging ? styles.dropZoneActive : ''} ${!isAdmin ? styles.disabled : ''}`}
			style={{
				border: image === '' ? '2px dashed #ccc' : 'none',
				cursor: !isAdmin ? 'default' : 'pointer',
				pointerEvents: !isAdmin && image ? 'none' : 'auto',
			}}
			onDragEnter={isAdmin ? handleDragEnter : undefined}
			onDragLeave={isAdmin ? handleDragLeave : undefined}
			onDragOver={isAdmin ? (e) => e.preventDefault() : undefined}
			onDrop={isAdmin ? handleDrop : undefined}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				onChange={handleFileChange}
				className={styles.fileInput}
				disabled={!isAdmin}
			/>

			{image !== '' && (
				<div className={styles.imageContainer}>
					<img
						src={image}
						alt={`image of ${statement?.statement || 'statement'}`}
						className={styles.imagePreview}
					/>
					{showSuccess && (
						<div className={styles.successOverlay}>
							<p>Upload complete! ✓</p>
						</div>
					)}
				</div>
			)}

			{!image && progress === 0 && <p>Drag and drop an image here or click to upload</p>}

			{progress > 0 && progress < 50 && !image && (
				<div className={styles.progressContainer}>
					<p>Compressing: {(progress * 2).toFixed(0)}%</p>
					<div className={styles.progressBar}>
						<div className={styles.progressFill} style={{ width: `${progress * 2}%` }} />
					</div>
				</div>
			)}

			{progress >= 50 && progress < 100 && (
				<div className={styles.progressContainer}>
					<p>Uploading: {((progress - 50) * 2).toFixed(0)}%</p>
					<div className={styles.progressBar}>
						<div className={styles.progressFill} style={{ width: `${(progress - 50) * 2}%` }} />
					</div>
				</div>
			)}
		</label>
	);
}
