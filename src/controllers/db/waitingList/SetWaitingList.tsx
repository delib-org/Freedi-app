import React, { useRef, FC } from 'react';

//Custom components
import Button from '../../../view/components/buttons/button/Button';
import UploadFileIcon from '../../../view/components/icons/UploadFileIcon';

//Styles
import styles from './setWaitingList.module.scss';
import VisuallyHidden from '@/view/components/accessibility/toScreenReaders/VisuallyHidden';

const SetWaitingList: FC = () => {
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files;
		if (files && files.length > 0) {
			console.error('File uploaded');
		}
	};

	const handleButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		fileInputRef.current?.click();
	};

	return (
		<div>
			<label htmlFor='uploadFile'>
				<VisuallyHidden labelName={'uploadFile'} />
			</label>
			<input
				id='uploadFile'
				className={styles.uploadInput}
				type='file'
				accept='.xlsx, .xls'
				onChange={handleFileChange}
				ref={fileInputRef}
			/>
			<Button
				icon={<UploadFileIcon />}
				text={'Upload members list'}
				onClick={handleButtonClick}
				className={'btn btn--affirmation'}
			/>
		</div>
	);
};

export default SetWaitingList;
