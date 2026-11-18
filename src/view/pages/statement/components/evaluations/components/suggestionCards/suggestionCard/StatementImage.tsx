import React, { FC, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import UploadImage from '@/view/components/uploadImage/UploadImage';
import { ImageLightbox } from '@/view/components/atomic/molecules/ImageLightbox';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { statementImageAttrs } from '@/helpers/statementImageAttrs';
import styles from './StatementImage.module.scss';

interface Props {
	statement: Statement;
	image: string;
	setImage: React.Dispatch<React.SetStateAction<string>>;
	displayMode: 'above' | 'inline' | 'thumb';
	onRemove: () => void;
	isAdmin: boolean;
	fileInputRef?: React.RefObject<HTMLInputElement>;
}

// How the admin's upload zone sizes the picture in each mode.
const UPLOAD_VARIANTS = { above: 'compact', inline: 'inline', thumb: 'cover' } as const;

// Rendered width per mode (StatementImage.module.scss, --card-photo-width), so
// the browser picks the small copy where the full photo would be wasted.
const RENDERED_SIZES = {
	above: '(max-width: 768px) 100vw, 768px',
	inline: '200px',
	thumb: '120px',
} as const;

const StatementImage: FC<Props> = ({
	statement,
	image,
	setImage,
	displayMode,
	onRemove,
	isAdmin,
	fileInputRef,
}) => {
	const { t, dir } = useTranslation();
	const [isEnlarged, setIsEnlarged] = useState(false);

	const containerClass = `${styles.imageContainer} ${styles[displayMode]}`;

	// Float direction for inline mode
	const floatStyle =
		displayMode === 'inline'
			? { float: (dir === 'ltr' ? 'left' : 'right') as 'left' | 'right' }
			: {};

	return (
		<div className={containerClass} style={floatStyle}>
			{/* An admin's press replaces the picture; everyone else's enlarges it. */}
			{isAdmin ? (
				<UploadImage
					statement={statement}
					fileInputRef={fileInputRef}
					image={image}
					setImage={setImage}
					isAdmin={isAdmin}
					variant={UPLOAD_VARIANTS[displayMode]}
					sizes={RENDERED_SIZES[displayMode]}
				/>
			) : (
				<>
					<button
						type="button"
						className={styles.enlargeBtn}
						onClick={() => setIsEnlarged(true)}
						aria-label={`${t('Enlarge image')}: ${statement.statement}`}
					>
						<img
							{...statementImageAttrs(statement, image, RENDERED_SIZES[displayMode])}
							alt=""
							className={styles.picture}
							loading="lazy"
							decoding="async"
						/>
					</button>
					<ImageLightbox
						isOpen={isEnlarged}
						onClose={() => setIsEnlarged(false)}
						src={image}
						alt={statement.statement}
						closeLabel={t('Close')}
						zoomInLabel={t('Zoom in')}
						zoomOutLabel={t('Zoom out')}
					/>
				</>
			)}
			{isAdmin && (
				<div className={styles.imageControls}>
					<button className={styles.imageRemoveBtn} onClick={onRemove} title={t('Remove Image')}>
						✕
					</button>
				</div>
			)}
		</div>
	);
};

export default StatementImage;
