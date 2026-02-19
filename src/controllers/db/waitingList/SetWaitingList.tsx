import React, { useRef, FC } from 'react';
import { logError } from '@/utils/errorHandling';

//Custom components
import Button from '../../../view/components/buttons/button/Button';
import UploadFileIcon from '../../../view/components/icons/UploadFileIcon';

//Styles
import styles from './setWaitingList.module.scss';

const SetWaitingList: FC = () => {
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files;
		if (files && files.length > 0) {
			logError(new Error('File uploaded'), { operation: 'waitingList.SetWaitingList.handleFileChange' });
		}
	};

	const handleButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		fileInputRef.current?.click();
	};

	return (
		<div>
			<label htmlFor="uploadFile">
				<span className="sr-only">uploadFile</span>
			</label>
			<input
				id="uploadFile"
				className={styles.uploadInput}
				type="file"
				accept=".xlsx, .xls"
				onChange={handleFileChange}
				ref={fileInputRef}
			/>
			<Button
				icon={<UploadFileIcon />}
				text={'Upload members list'}
				onClick={handleButtonClick}
				className={'btn btn--primary'}
			/>
		</div>
	);
};

export default SetWaitingList;
