import React from 'react';

import styles from './SettingsModal.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface Props {
	children?: React.ReactNode;
	closeModal?: () => void;
	isFullScreen?: boolean;
	customCloseWord?: string;
}

const SettingsModal: React.FC<Props> = ({
	children,
	closeModal,
	isFullScreen = false,
	customCloseWord = '',
}) => {
	const { t } = useTranslation();

	return (
		<div className={isFullScreen ? styles.fullScreenModal : styles.modal}>
			{children}
			<div className="btns">
				<button
					className={`btn btn--primary ${isFullScreen ? styles.bigButton : ''}`}
					onClick={closeModal}
				>
					{customCloseWord || t('Close')}
				</button>
			</div>
		</div>
	);
};

export default SettingsModal;
