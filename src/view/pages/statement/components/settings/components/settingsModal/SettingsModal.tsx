import React from 'react'
import CloseIcon from '@/assets/icons/close.svg?react';
import ArrowLeftIcon from '@/assets/icons/arrow-left.svg?react';
import styles from './SettingsModal.module.scss';

interface Props {
	children?: React.ReactNode;
	closeModal?: () => void;
}

const SettingsModal: React.FC<Props> = ({ children, closeModal }) => {
	return (
		<div className={styles.modal}>
			<div className={styles.modalHeader}>
				<ArrowLeftIcon
					className={styles.icon}
				/>
				<CloseIcon
					className={styles.icon}
					onClick={closeModal}			
					/>
			</div>
			{children}
		</div>
	)
}

export default SettingsModal