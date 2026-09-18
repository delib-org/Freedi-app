import React, { useRef, FC } from 'react';
import { logError } from '@/utils/errorHandling';
import { useTranslation } from '@/controllers/hooks/useTranslation';

//Custom components
import Button from '../../../view/components/buttons/button/Button';
import UploadFileIcon from '../../../view/components/icons/UploadFileIcon';

//Styles
import styles from './setWaitingList.module.scss';

const SetWaitingList: FC = () => {
	const { t } = useTranslation();
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files;
		if (files && files.length > 0) {
			logError(new Error('File uploaded'), {
				operation: 'waitingList.SetWaitingList.handleFileChange',
			});
		}
	};

	const handleButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		fileInputRef.current?.click();
	};

	return (
		<div>
			<input
				id="uploadFile"
				aria-label={t('Upload members list')}
				className={styles.uploadInput}
				type="file"
				accept=".xlsx, .xls"
				onChange={handleFileChange}
				ref={fileInputRef}
			/>
			<Button
				icon={<UploadFileIcon />}
				text={t('Upload members list')}
				onClick={handleButtonClick}
				className={'btn btn--primary'}
			/>
		</div>
	);
};

export default SetWaitingList;
