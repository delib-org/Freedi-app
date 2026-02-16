import React, { FC } from 'react';
import { Statement } from '@freedi/shared-types';
import UploadImage from '@/view/components/uploadImage/UploadImage';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './StatementImage.module.scss';

interface Props {
	statement: Statement;
	image: string;
	setImage: React.Dispatch<React.SetStateAction<string>>;
	displayMode: 'above' | 'inline';
	onRemove: () => void;
	isAdmin: boolean;
	fileInputRef?: React.RefObject<HTMLInputElement>;
}

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

	// Determine variant and container class based on display mode
	const variant = displayMode === 'inline' ? 'inline' : 'compact';
	const containerClass =
		displayMode === 'inline'
			? `${styles.imageContainer} ${styles.inline}`
			: `${styles.imageContainer} ${styles.above}`;

	// Float direction for inline mode
	const floatStyle =
		displayMode === 'inline'
			? { float: (dir === 'ltr' ? 'left' : 'right') as 'left' | 'right' }
			: {};

	return (
		<div className={containerClass} style={floatStyle}>
			<UploadImage
				statement={statement}
				fileInputRef={fileInputRef}
				image={image}
				setImage={setImage}
				isAdmin={isAdmin}
				variant={variant}
			/>
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
