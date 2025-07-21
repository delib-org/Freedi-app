import React from 'react';

import styles from './SettingsModal.module.scss';

interface Props {
	children?: React.ReactNode;
	closeModal?: () => void;
	isFullScreen?: boolean;
}

const SettingsModal: React.FC<Props> = ({
	children,
	closeModal,
	isFullScreen = false,
}) => {
	return (
		<div className={isFullScreen ? styles.fullScreenModal : styles.modal}>
			{children}
			<div className='btns'>
				<button className='btn btn--primary' onClick={closeModal}>
					Close
				</button>
			</div>
		</div>
	);
};

export default SettingsModal;
